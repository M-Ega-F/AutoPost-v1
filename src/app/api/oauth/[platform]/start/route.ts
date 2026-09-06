import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { loginUrlWithNext } from "@/lib/auth/redirect";
import { isMissingConfigError, resolveAppUrl, serverConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getProvider } from "@/providers/social";
import { PLATFORMS, type Platform } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_TTL_SECONDS = 10 * 60;

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Named only in the server log. The user sees the non-technical copy from
 * Design.md, never an environment variable name.
 */
function missingCredentialNames(platform: string): string[] {
  return platform === "tiktok"
    ? ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]
    : ["META_CLIENT_ID", "META_CLIENT_SECRET"];
}

function logDevelopmentOAuthStart(
  platform: Platform,
  authorizationUrl: string,
  redirectUri: string,
): void {
  if (process.env.NODE_ENV === "production") return;

  const parsed = new URL(authorizationUrl);
  logger.info("oauth start ready", {
    platform,
    appUrlConfigured: Boolean(serverConfig.appUrlOptional),
    metaClientIdConfigured:
      platform === "facebook" || platform === "instagram"
        ? Boolean(serverConfig.meta.clientId)
        : undefined,
    redirectUri,
    authorizationHost: parsed.host,
    authorizationPath: parsed.pathname,
    responseType: parsed.searchParams.get("response_type") ?? "none",
    scopePresent: parsed.searchParams.has("scope"),
    statePresent: parsed.searchParams.has("state"),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  const { platform } = await params;
  const origin = new URL(request.url).origin;

  // No session: send them to log in and come back to the Connect button.
  if (!user) {
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

  try {
    const provider = getProvider(platform);

    if (!provider.isConfigured()) {
      logger.warn("oauth provider not configured", {
        platform,
        missing: missingCredentialNames(platform),
      });

      const url = new URL("/connected-accounts", resolveAppUrl(origin));
      url.searchParams.set("error", "not_configured");
      url.searchParams.set("platform", platform);
      return NextResponse.redirect(url, 302);
    }

    // The provider signs and verifies the state itself; we only need entropy.
    const state = randomBytes(24).toString("base64url");
    const redirectUri = new URL(
      `/api/oauth/${platform}/callback`,
      resolveAppUrl(origin),
    ).toString();

    const authorizationUrl = await provider.getAuthorizationUrl({
      userId: user.id,
      state,
      redirectUri,
    });

    logDevelopmentOAuthStart(platform, authorizationUrl, redirectUri);

    const response = NextResponse.redirect(authorizationUrl, 302);
    response.cookies.set({
      name: `oauth_state_${platform}`,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    logger.error("oauth start failed", {
      platform,
      error: error instanceof Error ? error.message : String(error),
    });

    if (isMissingConfigError(error)) {
      logger.warn("oauth start blocked by configuration", {
        platform,
        missing: error.missing,
      });
    }

    const url = new URL("/connected-accounts", resolveAppUrl(origin));
    url.searchParams.set("error", "not_configured");
    url.searchParams.set("platform", platform);
    return NextResponse.redirect(url, 302);
  }
}
