import "server-only";

import { serverConfig } from "@/lib/env";
import { humanErrorMessage, ProviderError } from "@/lib/errors";
import type { Platform } from "@/lib/status";
import { formBody, requestJson, signOAuthState, verifyOAuthState } from "../http";

/**
 * Instagram and Facebook share one Meta app, one OAuth dialog and one grant.
 * Scope sets are platform-specific. Requesting Instagram permissions while
 * connecting only a Facebook Page can make Meta reject the whole dialog when
 * the app has not enabled the Instagram use case yet.
 */
export const META_FACEBOOK_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
].join(",");

export const META_INSTAGRAM_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export function metaScopesFor(platform: "facebook" | "instagram"): string {
  return platform === "facebook"
    ? META_FACEBOOK_SCOPES
    : META_INSTAGRAM_SCOPES;
}

export type MetaTokenResult = {
  accessToken: string;
  tokenExpiresAt: Date | null;
};

function graphBase(): string {
  return `https://graph.facebook.com/${serverConfig.meta.graphVersion}`;
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = serverConfig.meta;
  if (!clientId || !clientSecret) {
    throw new ProviderError({
      code: "provider_error",
      message: "Meta is not configured.",
      retryable: false,
    });
  }
  return { clientId, clientSecret };
}

export function metaAuthorizationUrl(input: {
  userId: string;
  workspaceId?: string;
  platform: Platform;
  state: string;
  redirectUri: string;
}): string {
  const { clientId } = serverConfig.meta;
  if (input.platform !== "facebook" && input.platform !== "instagram") {
    throw new Error("Meta OAuth only supports Facebook and Instagram.");
  }

  const params = new URLSearchParams({
    client_id: clientId ?? "",
    redirect_uri: input.redirectUri,
    // Signed, so the callback proves the state came from us and carries no
    // readable user id through the browser.
    state: signOAuthState({
      userId: input.userId,
      workspaceId: input.workspaceId,
      platform: input.platform,
      state: input.state,
    }),
    response_type: "code",
    scope: metaScopesFor(input.platform),
    auth_type: "rerequest",
  });

  return `https://www.facebook.com/${serverConfig.meta.graphVersion}/dialog/oauth?${params.toString()}`;
}

/**
 * Throws unless `state` is one we signed for a Meta platform. Instagram and
 * Facebook share one dialog, so a state minted for either is accepted here —
 * a state minted for TikTok is not.
 */
export function readMetaState(
  state: string,
  platform: Platform,
): { userId: string; workspaceId?: string } {
  const parsed = verifyOAuthState(state);
  if (
    !parsed ||
    (parsed.platform !== "instagram" && parsed.platform !== "facebook")
  ) {
    throw new ProviderError({
      code: "permission_denied",
      message: humanErrorMessage(platform, "permission_denied"),
      retryable: false,
    });
  }
  return {
    userId: parsed.userId,
    ...(parsed.workspaceId ? { workspaceId: parsed.workspaceId } : {}),
  };
}

type MetaTokenPayload = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function readToken(
  params: Record<string, string | number | undefined>,
  endpoint: string,
  platform: Platform,
): Promise<MetaTokenResult> {
  const { data } = await requestJson<MetaTokenPayload>(
    `${graphBase()}/oauth/access_token?${formBody(params)}`,
    { method: "GET" },
    { platform, endpoint },
  );

  if (!data.access_token) {
    throw new ProviderError({
      code: "token_expired",
      message: humanErrorMessage(platform, "token_expired"),
      retryable: false,
    });
  }

  return {
    accessToken: data.access_token,
    tokenExpiresAt:
      typeof data.expires_in === "number" && data.expires_in > 0
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
  };
}

/** Short-lived user token from the authorization code. */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  platform: Platform,
): Promise<MetaTokenResult> {
  const { clientId, clientSecret } = requireCredentials();

  return readToken(
    {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    },
    "GET /oauth/access_token (code)",
    platform,
  );
}

/**
 * Meta has no refresh token: a token is extended by exchanging it again. Page
 * tokens derived from a long-lived user token are effectively non-expiring, so
 * `tokenExpiresAt` may legitimately be `null`.
 */
export async function exchangeForLongLivedToken(
  token: string,
  platform: Platform,
): Promise<MetaTokenResult> {
  const { clientId, clientSecret } = requireCredentials();

  return readToken(
    {
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: token,
    },
    "GET /oauth/access_token (fb_exchange_token)",
    platform,
  );
}

/** Long-lived user token → the Pages (and their Instagram accounts) it can post to. */
export async function fetchUserPages(
  userToken: string,
  platform: Platform,
): Promise<MetaPage[]> {
  const params = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
    limit: "100",
  });

  const { data } = await requestJson<{ data?: MetaPage[] }>(
    `${graphBase()}/me/accounts?${params.toString()}`,
    { method: "GET", headers: { Authorization: `Bearer ${userToken}` } },
    { platform, endpoint: "GET /me/accounts" },
  );

  return Array.isArray(data.data) ? data.data : [];
}

export type MetaInstagramAccount = {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

export type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: MetaInstagramAccount;
};
