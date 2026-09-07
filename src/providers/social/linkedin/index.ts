import "server-only";

import { decryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";
import {
  humanErrorMessage,
  isAuthFailure,
  ProviderError,
} from "@/lib/errors";
import type { SocialAccountStatus } from "@/lib/status";
import {
  formBody,
  jsonBody,
  requestJson,
  responseLog as buildResponseLog,
  signOAuthState,
  uploadBytes,
  validateMediaLimits,
  verifyOAuthState,
} from "../http";
import type {
  ConnectedAccountDraft,
  PublishInput,
  PublishResult,
  RefreshResult,
  SocialAccountRecord,
  SocialProvider,
  ValidationResult,
} from "../types";

const PLATFORM = "linkedin" as const;
const API_BASE = "https://api.linkedin.com";
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const SCOPES = "openid profile w_member_social";

function requireCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = serverConfig.linkedin;
  if (!clientId || !clientSecret) {
    throw new ProviderError({
      code: "provider_error",
      message: "LinkedIn is not configured.",
      retryable: false,
    });
  }
  return { clientId, clientSecret };
}

function headers(token: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": serverConfig.linkedin.version,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function accountToken(account: SocialAccountRecord): string {
  if (!account.encryptedAccessToken) {
    throw new ProviderError({
      code: "account_needs_reconnect",
      message: humanErrorMessage(PLATFORM, "account_needs_reconnect"),
      retryable: false,
    });
  }
  return decryptSecret(account.encryptedAccessToken);
}

function metadataOf(account: SocialAccountRecord): Record<string, unknown> {
  return typeof account.metadata === "object" && account.metadata !== null
    ? (account.metadata as Record<string, unknown>)
    : {};
}

type LinkedInToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

type LinkedInProfile = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

function tokenExpiry(value: unknown): Date | null {
  return typeof value === "number" && value > 0
    ? new Date(Date.now() + value * 1000)
    : null;
}

async function readProfile(token: string): Promise<LinkedInProfile> {
  const { data } = await requestJson<LinkedInProfile>(
    `${API_BASE}/v2/userinfo`,
    { method: "GET", headers: headers(token) },
    { platform: PLATFORM, endpoint: "GET /v2/userinfo" },
  );
  return data;
}

function uploadUrlOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  for (const item of Object.values(value as Record<string, unknown>)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.uploadUrl === "string") return record.uploadUrl;
    const nested = uploadUrlOf(record);
    if (nested) return nested;
  }
  return null;
}

async function uploadMedia(input: PublishInput): Promise<string> {
  const { bytes, size, mimeType } = await input.readMedia(input.media);
  const accountMetadata = metadataOf(input.account);
  const owner =
    typeof accountMetadata.authorUrn === "string"
      ? accountMetadata.authorUrn
      : `urn:li:person:${input.account.platformAccountId}`;
  const recipe =
    input.media.mediaType === "video"
      ? "urn:li:digitalmediaRecipe:feedshare-video"
      : "urn:li:digitalmediaRecipe:feedshare-image";

  const registered = await requestJson<{
    value?: {
      asset?: string;
      uploadMechanism?: unknown;
    };
  }>(
    `${API_BASE}/rest/assets?action=registerUpload`,
    {
      method: "POST",
      headers: headers(input.accessToken, true),
      body: jsonBody({
        registerUploadRequest: {
          owner,
          recipes: [recipe],
          serviceRelationships: [
            { identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" },
          ],
          supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
        },
      }),
    },
    { platform: PLATFORM, endpoint: "POST /rest/assets?action=registerUpload" },
  );

  const asset = registered.data.value?.asset;
  const uploadUrl = uploadUrlOf(registered.data.value?.uploadMechanism);
  if (!asset || !uploadUrl) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: registered.responseLog,
    });
  }

  await uploadBytes(uploadUrl, bytes, {
    platform: PLATFORM,
    endpoint: "PUT {linkedin-upload-url}",
    contentType: mimeType,
    contentRange: `bytes 0-${Math.max(0, size - 1)}/${size}`,
  });

  return asset;
}

async function publishPost(input: PublishInput): Promise<PublishResult> {
  const accountMetadata = metadataOf(input.account);
  const author =
    typeof accountMetadata.authorUrn === "string"
      ? accountMetadata.authorUrn
      : `urn:li:person:${input.account.platformAccountId}`;
  const mediaId = await uploadMedia(input);

  const result = await requestJson<unknown>(
    `${API_BASE}/rest/posts`,
    {
      method: "POST",
      headers: headers(input.accessToken, true),
      body: jsonBody({
        author,
        commentary: input.caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: { media: { title: input.caption.slice(0, 200), id: mediaId } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    },
    { platform: PLATFORM, endpoint: "POST /rest/posts" },
  );

  return {
    status: "published",
    externalPostId: result.headers.get("x-restli-id"),
    responseLog: buildResponseLog(PLATFORM, "linkedin-post", 201, {
      postId: result.headers.get("x-restli-id"),
      mediaId,
    }),
  };
}

export const linkedinProvider: SocialProvider = {
  platform: PLATFORM,

  isConfigured(): boolean {
    const { clientId, clientSecret } = serverConfig.linkedin;
    return Boolean(clientId && clientSecret);
  },

  async getAuthorizationUrl(input): Promise<string> {
    const { clientId } = serverConfig.linkedin;
    return `${AUTHORIZE_URL}?${new URLSearchParams({
      response_type: "code",
      client_id: clientId ?? "",
      redirect_uri: input.redirectUri,
      state: signOAuthState({ userId: input.userId, platform: PLATFORM, state: input.state }),
      scope: SCOPES,
    }).toString()}`;
  },

  async handleCallback(input): Promise<ConnectedAccountDraft[]> {
    const state = verifyOAuthState(input.state);
    if (!state || state.platform !== PLATFORM || state.userId !== input.userId) {
      throw new ProviderError({
        code: "permission_denied",
        message: humanErrorMessage(PLATFORM, "permission_denied"),
        retryable: false,
      });
    }

    const { clientId, clientSecret } = requireCredentials();
    const token = await requestJson<LinkedInToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          grant_type: "authorization_code",
          code: input.code,
          redirect_uri: input.redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth/v2/accessToken" },
    );

    if (!token.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: token.responseLog,
      });
    }

    const profile = await readProfile(token.data.access_token);
    if (!profile.sub) {
      throw new ProviderError({
        code: "provider_error",
        message: humanErrorMessage(PLATFORM, "provider_error"),
        retryable: false,
      });
    }

    return [
      {
        platform: PLATFORM,
        platformAccountId: profile.sub,
        username: profile.name ?? profile.sub,
        displayName: profile.name ?? profile.sub,
        avatarUrl: profile.picture ?? null,
        accessToken: token.data.access_token,
        refreshToken: token.data.refresh_token ?? null,
        tokenExpiresAt: tokenExpiry(token.data.expires_in),
        scopes: token.data.scope ?? SCOPES,
        metadata: { authorUrn: `urn:li:person:${profile.sub}` },
      },
    ];
  },

  async refreshToken(account): Promise<RefreshResult> {
    const { clientId, clientSecret } = requireCredentials();
    if (!account.encryptedRefreshToken) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
      });
    }

    const token = await requestJson<LinkedInToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          grant_type: "refresh_token",
          refresh_token: decryptSecret(account.encryptedRefreshToken),
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth/v2/accessToken (refresh)" },
    );

    if (!token.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: token.responseLog,
      });
    }

    return {
      accessToken: token.data.access_token,
      refreshToken: token.data.refresh_token ?? decryptSecret(account.encryptedRefreshToken),
      tokenExpiresAt: tokenExpiry(token.data.expires_in),
    };
  },

  async validateAccount(account): Promise<SocialAccountStatus> {
    try {
      await readProfile(accountToken(account));
      return "active";
    } catch (error) {
      return error instanceof ProviderError && isAuthFailure(error.code)
        ? "needs_reconnect"
        : "active";
    }
  },

  async validateContent(input): Promise<ValidationResult> {
    return validateMediaLimits(PLATFORM, input.media, input.caption);
  },

  async publish(input): Promise<PublishResult> {
    return publishPost(input);
  },
};
