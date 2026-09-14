import "server-only";

import { createHash, randomBytes } from "node:crypto";

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
  sleep,
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

const PLATFORM = "x" as const;
const API_BASE = "https://api.x.com";
const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = `${API_BASE}/2/oauth2/token`;
const SCOPES = "tweet.read tweet.write users.read offline.access";

function requireCredentials(): { clientId: string; clientSecret?: string } {
  const { clientId, clientSecret } = serverConfig.x;
  if (!clientId) {
    throw new ProviderError({
      code: "provider_error",
      message: "X is not configured.",
      retryable: false,
    });
  }
  return { clientId, clientSecret };
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

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

type XToken = {
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type XUser = {
  data?: { id?: string; name?: string; username?: string; profile_image_url?: string };
};

function tokenExpiry(value: unknown): Date | null {
  return typeof value === "number" && value > 0
    ? new Date(Date.now() + value * 1000)
    : null;
}

async function readProfile(token: string): Promise<XUser["data"]> {
  const { data } = await requestJson<XUser>(
    `${API_BASE}/2/users/me?user.fields=profile_image_url,name,username`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    { platform: PLATFORM, endpoint: "GET /2/users/me" },
  );
  return data.data;
}

async function uploadMedia(input: PublishInput): Promise<string> {
  const { bytes, mimeType } = await input.readMedia(input.media);
  const mediaResult = await requestJson<{
    data?: { id?: string; media_key?: string; processing_info?: { state?: string; check_after_secs?: number } };
  }>(
    `${API_BASE}/2/media/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: jsonBody({
        media: Buffer.from(bytes).toString("base64"),
        media_category: input.media.mediaType === "video" ? "tweet_video" : "tweet_image",
        media_type: mimeType,
      }),
    },
    { platform: PLATFORM, endpoint: "POST /2/media/upload" },
  );

  const mediaId = mediaResult.data.data?.id;
  if (!mediaId) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: mediaResult.responseLog,
    });
  }

  let state = mediaResult.data.data?.processing_info?.state;
  for (let attempt = 0; attempt < 10 && (state === "pending" || state === "in_progress"); attempt += 1) {
    await sleep((mediaResult.data.data?.processing_info?.check_after_secs ?? 1) * 1000);
    const status = await requestJson<{
      data?: { processing_info?: { state?: string; check_after_secs?: number } };
    }>(
      `${API_BASE}/2/media/upload?media_id=${encodeURIComponent(mediaId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${input.accessToken}` } },
      { platform: PLATFORM, endpoint: "GET /2/media/upload" },
    );
    state = status.data.data?.processing_info?.state;
    if (state === "failed") {
      throw new ProviderError({
        code: "publish_failed",
        message: humanErrorMessage(PLATFORM, "publish_failed"),
        retryable: false,
        responseLog: status.responseLog,
      });
    }
  }

  if (state === "pending" || state === "in_progress") {
    throw new ProviderError({
      code: "timeout",
      message: humanErrorMessage(PLATFORM, "timeout"),
      retryable: true,
    });
  }

  return mediaId;
}

async function publishPost(input: PublishInput): Promise<PublishResult> {
  const mediaId = await uploadMedia(input);
  const result = await requestJson<{ data?: { id?: string } }>(
    `${API_BASE}/2/tweets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: jsonBody({ text: input.caption, media: { media_ids: [mediaId] } }),
    },
    { platform: PLATFORM, endpoint: "POST /2/tweets" },
  );

  if (!result.data.data?.id) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: result.responseLog,
    });
  }

  return {
    status: "published",
    externalPostId: result.data.data.id,
    responseLog: buildResponseLog(PLATFORM, "x-post", 201, {
      postId: result.data.data.id,
      mediaId,
    }),
  };
}

export const xProvider: SocialProvider = {
  platform: PLATFORM,

  isConfigured(): boolean {
    return Boolean(serverConfig.x.clientId);
  },

  async getAuthorizationUrl(input): Promise<string> {
    const { clientId } = requireCredentials();
    const verifier = randomBytes(32).toString("base64url");
    input.setCookie?.({ name: "oauth_pkce_x", value: verifier, maxAge: 600 });

    return `${AUTHORIZE_URL}?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: input.redirectUri,
      scope: SCOPES,
      state: signOAuthState({ userId: input.userId, workspaceId: input.workspaceId, platform: PLATFORM, state: input.state }),
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
    }).toString()}`;
  },

  async handleCallback(input): Promise<ConnectedAccountDraft[]> {
    const state = verifyOAuthState(input.state);
    if (!state || state.platform !== PLATFORM || state.userId !== input.userId || !input.codeVerifier) {
      throw new ProviderError({
        code: "permission_denied",
        message: humanErrorMessage(PLATFORM, "permission_denied"),
        retryable: false,
      });
    }

    const { clientId, clientSecret } = requireCredentials();
    const token = await requestJson<XToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          code: input.code,
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: input.redirectUri,
          code_verifier: input.codeVerifier,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /2/oauth2/token" },
    );

    if (!token.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: token.responseLog,
      });
    }

    const user = await readProfile(token.data.access_token);
    if (!user?.id) {
      throw new ProviderError({
        code: "provider_error",
        message: humanErrorMessage(PLATFORM, "provider_error"),
        retryable: false,
      });
    }

    return [
      {
        platform: PLATFORM,
        platformAccountId: user.id,
        username: user.username ?? null,
        displayName: user.name ?? user.username ?? user.id,
        avatarUrl: user.profile_image_url ?? null,
        accessToken: token.data.access_token,
        refreshToken: token.data.refresh_token ?? null,
        tokenExpiresAt: tokenExpiry(token.data.expires_in),
        scopes: token.data.scope ?? SCOPES,
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

    const token = await requestJson<XToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          refresh_token: decryptSecret(account.encryptedRefreshToken),
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /2/oauth2/token (refresh)" },
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
