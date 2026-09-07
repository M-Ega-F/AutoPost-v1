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
  requestJson,
  responseLog as buildResponseLog,
  signOAuthState,
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

const PLATFORM = "threads" as const;
const GRAPH_BASE = "https://graph.threads.net/v1.0";
const OAUTH_BASE = "https://graph.threads.net";
const AUTHORIZE_URL = "https://threads.net/oauth/authorize";
const SCOPES = "threads_basic,threads_content_publish";

function requireCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = serverConfig.threads;
  if (!clientId || !clientSecret) {
    throw new ProviderError({
      code: "provider_error",
      message: "Threads is not configured.",
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

type ThreadsToken = {
  access_token?: string;
  user_id?: string;
  expires_in?: number;
};

type ThreadsUser = {
  id?: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
};

function tokenExpiry(expiresIn: unknown): Date | null {
  return typeof expiresIn === "number" && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000)
    : null;
}

async function readProfile(token: string): Promise<ThreadsUser> {
  const { data } = await requestJson<ThreadsUser>(
    `${GRAPH_BASE}/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`,
    { method: "GET" },
    { platform: PLATFORM, endpoint: "GET /me" },
  );
  return data;
}

async function publishMedia(input: PublishInput): Promise<PublishResult> {
  const userId = input.account.platformAccountId;
  const mediaUrl = await input.resolveMediaUrl(input.media);
  const mediaType = input.media.mediaType === "image" ? "IMAGE" : "VIDEO";
  const container = await requestJson<{ id?: string }>(
    `${GRAPH_BASE}/${encodeURIComponent(userId)}/threads`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: formBody({
        media_type: mediaType,
        ...(mediaType === "IMAGE" ? { image_url: mediaUrl } : { video_url: mediaUrl }),
        text: input.caption,
      }),
    },
    { platform: PLATFORM, endpoint: "POST /{threads-user-id}/threads" },
  );

  if (!container.data.id) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog: container.responseLog,
    });
  }

  const published = await requestJson<{ id?: string }>(
    `${GRAPH_BASE}/${encodeURIComponent(userId)}/threads_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: formBody({ creation_id: container.data.id }),
    },
    { platform: PLATFORM, endpoint: "POST /{threads-user-id}/threads_publish" },
  );

  return {
    status: "published",
    externalPostId: published.data.id ?? container.data.id,
    responseLog: buildResponseLog(PLATFORM, "threads-publish", 200, {
      containerId: container.data.id,
      postId: published.data.id ?? null,
    }),
  };
}

export const threadsProvider: SocialProvider = {
  platform: PLATFORM,

  isConfigured(): boolean {
    const { clientId, clientSecret } = serverConfig.threads;
    return Boolean(clientId && clientSecret);
  },

  async getAuthorizationUrl(input): Promise<string> {
    const { clientId } = serverConfig.threads;
    return `${AUTHORIZE_URL}?${new URLSearchParams({
      client_id: clientId ?? "",
      redirect_uri: input.redirectUri,
      scope: SCOPES,
      response_type: "code",
      state: signOAuthState({
        userId: input.userId,
        platform: PLATFORM,
        state: input.state,
      }),
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
    const tokenResult = await requestJson<ThreadsToken>(
      `${OAUTH_BASE}/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          redirect_uri: input.redirectUri,
          code: input.code,
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth/access_token" },
    );

    if (!tokenResult.data.access_token || !tokenResult.data.user_id) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: tokenResult.responseLog,
      });
    }

    const longLived = await requestJson<ThreadsToken>(
      `${OAUTH_BASE}/access_token?${formBody({
        grant_type: "th_exchange_token",
        client_secret: clientSecret,
        access_token: tokenResult.data.access_token,
      })}`,
      { method: "GET" },
      { platform: PLATFORM, endpoint: "GET /access_token (long-lived)" },
    );
    const accessToken = longLived.data.access_token ?? tokenResult.data.access_token;
    const user = await readProfile(accessToken);
    const accountId = user.id ?? tokenResult.data.user_id;

    return [
      {
        platform: PLATFORM,
        platformAccountId: accountId,
        username: user.username ?? null,
        displayName: user.name ?? user.username ?? accountId,
        avatarUrl: user.threads_profile_picture_url ?? null,
        accessToken,
        refreshToken: null,
        tokenExpiresAt: tokenExpiry(longLived.data.expires_in ?? tokenResult.data.expires_in),
        scopes: SCOPES,
      },
    ];
  },

  async refreshToken(account): Promise<RefreshResult> {
    requireCredentials();
    const token = accountToken(account);
    const result = await requestJson<ThreadsToken>(
      `${OAUTH_BASE}/refresh_access_token?${formBody({
        grant_type: "th_refresh_token",
        access_token: token,
      })}`,
      { method: "GET" },
      { platform: PLATFORM, endpoint: "GET /refresh_access_token" },
    );

    if (!result.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: result.responseLog,
      });
    }

    return {
      accessToken: result.data.access_token,
      refreshToken: null,
      tokenExpiresAt: tokenExpiry(result.data.expires_in),
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
    return publishMedia(input);
  },
};
