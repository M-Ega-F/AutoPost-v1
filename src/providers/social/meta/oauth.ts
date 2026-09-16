import "server-only";

import { serverConfig } from "@/lib/env";
import { humanErrorMessage, ProviderError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Platform } from "@/lib/status";
import { formBody, requestJson, signOAuthState, verifyOAuthState } from "../http";

/** Facebook Login permissions for Page connections. */
export const META_FACEBOOK_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
  "business_management",
  "catalog_management",
  "commerce_account_manage_orders",
  "commerce_account_read_orders",
  "commerce_account_read_reports",
  "commerce_account_read_settings",
  "email",
  "facebook_branded_content_ads_brand",
  "facebook_creator_marketplace_discovery",
  "leads_retrieval",
  "live_shopping_manage_video",
  "manage_app_solution",
  "manage_fundraisers",
  "marketing_messages_messenger",
  "page_events",
  "pages_manage_ads",
  "pages_manage_cta",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_manage_instant_articles",
  "pages_messaging",
  "pages_messaging_phone_number",
  "pages_read_user_content",
  "pages_utility_messaging",
  "paid_marketing_messages",
  "private_computation_access",
  "publish_video",
  "read_insights",
  "read_page_mailboxes",
].join(",");

export const META_INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

export function metaScopesFor(platform: "facebook" | "instagram"): string {
  return platform === "facebook"
    ? META_FACEBOOK_SCOPES
    : META_INSTAGRAM_SCOPES;
}

const META_FACEBOOK_PAGE_FIELDS = [
  "id",
  "name",
  "access_token",
] as const;

export type MetaTokenResult = {
  accessToken: string;
  tokenType: string | null;
  tokenExpiresAt: Date | null;
  userId?: string;
};

function graphBase(): string {
  return `https://graph.facebook.com/${serverConfig.meta.graphVersion}`;
}

function instagramGraphBase(): string {
  return `https://graph.instagram.com/${serverConfig.instagram.graphVersion}`;
}

function requireCredentials(
  platform: Platform,
): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } =
    platform === "instagram" ? serverConfig.instagram : serverConfig.meta;
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
  if (input.platform !== "facebook" && input.platform !== "instagram") {
    throw new Error("Meta OAuth only supports Facebook and Instagram.");
  }

  const clientId =
    input.platform === "instagram"
      ? serverConfig.instagram.clientId
      : serverConfig.meta.clientId;

  const requestedScopes = metaScopesFor(input.platform).split(",");
  logger.info("meta oauth scopes requested", {
    platform: input.platform,
    oauthAppId: clientId ?? null,
    requestedScopes,
    scopeCount: requestedScopes.length,
  });

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
  });

  if (input.platform === "facebook") {
    params.set("auth_type", "rerequest");
    return `https://www.facebook.com/${serverConfig.meta.graphVersion}/dialog/oauth?${params.toString()}`;
  }

  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

/** Throws unless `state` is one we signed for a Meta platform. */
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

type InstagramCodeTokenPayload = MetaTokenPayload & {
  user_id?: string | number;
  permissions?: string;
  data?: MetaTokenPayload & { user_id?: string | number } | Array<MetaTokenPayload & { user_id?: string | number }>;
};

function tokenResult(
  data: MetaTokenPayload,
  platform: Platform,
  userId?: string | number,
): MetaTokenResult {
  if (!data.access_token) {
    throw new ProviderError({
      code: "token_expired",
      message: humanErrorMessage(platform, "token_expired"),
      retryable: false,
    });
  }

  return {
    accessToken: data.access_token,
    tokenType: typeof data.token_type === "string" ? data.token_type : null,
    tokenExpiresAt:
      typeof data.expires_in === "number" && data.expires_in > 0
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    ...(userId !== undefined ? { userId: String(userId) } : {}),
  };
}

function instagramCodeTokenResult(
  data: InstagramCodeTokenPayload,
): MetaTokenResult {
  const candidate = Array.isArray(data.data)
    ? data.data[0]
    : asRecord(data.data) ?? data;
  const token = candidate as MetaTokenPayload & { user_id?: string | number };
  return tokenResult(token, "instagram", token.user_id);
}

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

  return tokenResult(data, platform);
}

async function readTokenFromUrl(
  baseUrl: string,
  params: Record<string, string | number | undefined>,
  endpoint: string,
  platform: Platform,
): Promise<MetaTokenResult> {
  const { data } = await requestJson<MetaTokenPayload>(
    `${baseUrl}?${formBody(params)}`,
    { method: "GET" },
    { platform, endpoint },
  );

  return tokenResult(data, platform);
}

async function exchangeInstagramCodeForToken(
  code: string,
  redirectUri: string,
): Promise<MetaTokenResult> {
  const { clientId, clientSecret } = requireCredentials("instagram");
  const { data } = await requestJson<InstagramCodeTokenPayload>(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    },
    { platform: "instagram", endpoint: "POST /oauth/access_token" },
  );

  return instagramCodeTokenResult(data);
}

/** Short-lived user token from the authorization code. */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  platform: Platform,
): Promise<MetaTokenResult> {
  if (platform === "instagram") {
    return exchangeInstagramCodeForToken(code, redirectUri);
  }

  const { clientId, clientSecret } = requireCredentials("facebook");

  logger.info("meta oauth code exchange configured", {
    platform,
    exchangeAppId: clientId,
    redirectUri,
  });

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
  const { clientId, clientSecret } = requireCredentials(platform);

  if (platform === "instagram") {
    return readTokenFromUrl(
      "https://graph.instagram.com/access_token",
      {
        grant_type: "ig_exchange_token",
        client_secret: clientSecret,
        access_token: token,
      },
      "GET /access_token (ig_exchange_token)",
      platform,
    );
  }

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

export type MetaInstagramLoginIdentity = {
  id: string | null;
  username: string | null;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reads the Instagram User directly; no Facebook Page relationship is used. */
export async function fetchInstagramLoginIdentity(
  userToken: string,
): Promise<MetaInstagramLoginIdentity> {
  const params = new URLSearchParams({ fields: "id,username" });
  const { data, responseLog } = await requestJson<MetaInstagramLoginIdentity>(
    `${instagramGraphBase()}/me?${params.toString()}`,
    { method: "GET", headers: { Authorization: `Bearer ${userToken}` } },
    { platform: "instagram", endpoint: "GET /me (Instagram Login)" },
  );
  const identity = {
    id: stringValue(data.id),
    username: stringValue(data.username),
  };

  logger.info("instagram login identity ready", {
    platform: "instagram",
    endpoint: "/me",
    graphVersion: serverConfig.instagram.graphVersion,
    httpStatus: responseLog.status,
    responseSuccess: true,
    userCredentialPresent: userToken.length > 0,
    instagramUserId: identity.id,
    instagramUsername: identity.username,
  });

  return identity;
}

/** Facebook-only Page discovery. Instagram relations are intentionally not requested. */
export async function fetchFacebookPages(userToken: string): Promise<MetaPage[]> {
  const params = new URLSearchParams({
    fields: META_FACEBOOK_PAGE_FIELDS.join(","),
    limit: "100",
  });

  logger.info("meta page discovery request", {
    platform: "facebook",
    method: "GET",
    endpoint: "/me/accounts",
    graphVersion: serverConfig.meta.graphVersion,
    fields: [...META_FACEBOOK_PAGE_FIELDS],
    limit: 100,
    userCredentialPresent: userToken.length > 0,
  });

  try {
    const { data, responseLog } = await requestJson<MetaPagesPayload>(
      `${graphBase()}/me/accounts?${params.toString()}`,
      { method: "GET", headers: { Authorization: `Bearer ${userToken}` } },
      { platform: "facebook", endpoint: "GET /me/accounts" },
    );

    const pages = Array.isArray(data.data) ? data.data : [];
    logger.info("meta pages discovery response", {
      platform: "facebook",
      endpoint: "/me/accounts",
      graphVersion: serverConfig.meta.graphVersion,
      httpStatus: responseLog.status,
      responseSuccess: true,
      dataIsArray: Array.isArray(data.data),
      pageCount: pages.length,
      pages: pages.map((page) => ({
        id: page.id ?? null,
        name: page.name ?? null,
        tasks: Array.isArray(page.tasks)
          ? page.tasks.filter(
              (task): task is string => typeof task === "string",
            )
          : [],
        pageAuthPresent:
          typeof page.access_token === "string" &&
          page.access_token.length > 0,
      })),
      pagingPresent: Boolean(data.paging),
    });

    return pages;
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    const responseLog = providerError?.responseLog;
    const responseRecord = asRecord(responseLog);
    const body = asRecord(responseRecord?.body);
    const metaError = asRecord(body?.error);

    logger.error("meta pages discovery failed", {
      platform: "facebook",
      endpoint: "/me/accounts",
      graphVersion: serverConfig.meta.graphVersion,
      httpStatus: providerError?.status ?? responseRecord?.status ?? null,
      responseSuccess: false,
      metaErrorCode: metaError?.code ?? body?.code ?? null,
      metaErrorType: metaError?.type ?? null,
      metaErrorMessage: metaError?.message ?? body?.message ?? null,
      metaErrorSubcode: metaError?.error_subcode ?? null,
      fbtraceId: metaError?.fbtrace_id ?? null,
    });
    throw error;
  }
}

type MetaPagesPayload = {
  data?: MetaPage[];
  paging?: unknown;
  error?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
};
