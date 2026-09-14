import { NextResponse, type NextRequest } from "next/server";

import { getUserId } from "@/lib/auth/server";
import { loginUrlWithNext } from "@/lib/auth/redirect";
import { saveConnectedAccounts } from "@/lib/domain/accounts";
import { isMissingConfigError, resolveAppUrl } from "@/lib/env";
import { AppError, ProviderError, isAuthFailure } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getProvider } from "@/providers/social";
import { PLATFORMS, type Platform } from "@/lib/status";
import { requireWorkspaceMember } from "@/lib/domain/workspaces";
import { verifyOAuthState } from "@/providers/social/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OAuthErrorCode = "denied" | "not_configured" | "token" | "unknown";

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

function clearStateCookie(response: NextResponse, platform: string): NextResponse {
  response.cookies.set({
    name: `oauth_state_${platform}`,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  if (platform === "x") {
    response.cookies.set({
      name: "oauth_pkce_x",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

function errorRedirect(
  origin: string,
  platform: string,
  code: OAuthErrorCode,
): NextResponse {
  const url = new URL("/connected-accounts", resolveAppUrl(origin));
  url.searchParams.set("error", code);
  url.searchParams.set("platform", platform);
  return clearStateCookie(NextResponse.redirect(url, 303), platform);
}

function successRedirect(
  origin: string,
  platform: string,
  platforms: Platform[],
): NextResponse {
  const url = new URL("/connected-accounts", resolveAppUrl(origin));
  url.searchParams.set("connected", platforms.join(","));
  return clearStateCookie(NextResponse.redirect(url, 303), platform);
}

function classifyError(error: unknown): OAuthErrorCode {
  if (error instanceof ProviderError) {
    if (error.code === "permission_denied") return "denied";
    if (isAuthFailure(error.code)) return "token";
    return "unknown";
  }

  if (error instanceof AppError) {
    if (error.code === "not_configured") return "not_configured";
    if (error.code === "permission_denied") return "denied";
    if (isAuthFailure(error.code)) return "token";
    return "unknown";
  }

  if (isMissingConfigError(error)) return "not_configured";

  return "unknown";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { platform } = await params;
  const origin = new URL(request.url).origin;

  // No session: nothing to link, so log in first and come back.
  if (!userId) {
    return NextResponse.redirect(
      new URL(loginUrlWithNext("/connected-accounts"), origin),
      302,
    );
  }

  if (!isPlatform(platform)) {
    return NextResponse.json(
      { message: "We couldn't find that platform." },
      { status: 404 },
    );
  }

  if (!consumeRateLimit("oauthCallback", userId).ok) {
    return errorRedirect(origin, platform, "unknown");
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const provider = getProvider(platform);
  if (!provider.isConfigured()) {
    logger.warn("oauth callback blocked: provider not configured", { platform });
    return errorRedirect(origin, platform, "not_configured");
  }

  // The provider denied the grant, or the callback was tampered with.
  if (searchParams.get("error") || !code || !state) {
    return errorRedirect(origin, platform, "denied");
  }

  const expectedState = request.cookies.get(`oauth_state_${platform}`)?.value;
  if (!expectedState || expectedState !== state) {
    logger.warn("oauth callback rejected: state mismatch", { platform });
    return errorRedirect(origin, platform, "denied");
  }

  const redirectUri = new URL(
    `/api/oauth/${platform}/callback`,
    resolveAppUrl(origin),
  ).toString();

  try {
    const signedState = verifyOAuthState(state);
    if (
      !signedState ||
      signedState.userId !== userId ||
      signedState.platform !== platform ||
      !signedState.workspaceId
    ) {
      return errorRedirect(origin, platform, "denied");
    }
    await requireWorkspaceMember(userId, signedState.workspaceId);
    const drafts = await provider.handleCallback({
      userId,
      workspaceId: signedState.workspaceId,
      code,
      state,
      redirectUri,
      codeVerifier: request.cookies.get("oauth_pkce_x")?.value,
    });

    const saved = await saveConnectedAccounts(userId, drafts, signedState.workspaceId);

    if (saved.length === 0) {
      return errorRedirect(origin, platform, "denied");
    }

    return successRedirect(origin, platform, saved);
  } catch (error) {
    logger.error("oauth callback failed", {
      platform,
      error: error instanceof Error ? error.message : String(error),
    });

    if (isMissingConfigError(error)) {
      logger.warn("oauth callback blocked by configuration", {
        platform,
        missing: error.missing,
      });
    }

    return errorRedirect(origin, platform, classifyError(error));
  }
}
