import "server-only";

import { decryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";
import { humanErrorMessage, isAuthFailure, ProviderError, type ErrorCode } from "@/lib/errors";
import { YOUTUBE_PRIVACY_VALUES, type YouTubePostSettings } from "@/lib/youtube";
import type { SocialAccountStatus } from "@/lib/status";
import {
  formBody,
  jsonBody,
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

const PLATFORM = "youtube" as const;
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const DEFAULT_PRIVACY = "private" as const;

type GoogleToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type YouTubeChannel = {
  id?: string;
  snippet?: {
    title?: string;
    thumbnails?: { default?: { url?: string } };
  };
};

type YouTubeVideo = { id?: string };

function requireCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = serverConfig.youtube;
  if (!clientId || !clientSecret) {
    throw new ProviderError({
      code: "provider_error",
      message: "YouTube is not configured.",
      retryable: false,
    });
  }
  return { clientId, clientSecret };
}

function tokenExpiry(value: unknown): Date | null {
  return typeof value === "number" && value > 0
    ? new Date(Date.now() + value * 1000)
    : null;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
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

function settingsOf(value: unknown): YouTubePostSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const container = value as Record<string, unknown>;
  const record = container.youtube && typeof container.youtube === "object" && !Array.isArray(container.youtube)
    ? container.youtube as Record<string, unknown>
    : container;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const privacy = record.privacy;
  if (!title || !(YOUTUBE_PRIVACY_VALUES as readonly unknown[]).includes(privacy)) return null;
  return { title, privacy: privacy as YouTubePostSettings["privacy"] };
}

function reasonOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  const error = root.error && typeof root.error === "object"
    ? (root.error as Record<string, unknown>)
    : root;
  const errors = Array.isArray(error.errors) ? error.errors : [];
  const first = errors[0] && typeof errors[0] === "object" ? errors[0] as Record<string, unknown> : null;
  return typeof first?.reason === "string" ? first.reason : "";
}

function messageOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  const error = root.error && typeof root.error === "object"
    ? (root.error as Record<string, unknown>)
    : root;
  return typeof error.message === "string" ? error.message : "";
}

function mapYouTubeError(
  status: number,
  payload: unknown,
): ProviderError {
  const reason = reasonOf(payload).toLowerCase();
  const providerMessage = messageOf(payload).toLowerCase();
  const haystack = `${reason} ${providerMessage}`;
  let code: ErrorCode = "provider_error";

  if (haystack.includes("quota") || haystack.includes("dailylimit") || haystack.includes("uploadlimit")) {
    code = "quota_exceeded";
  } else if (haystack.includes("audit") || haystack.includes("unverified") || haystack.includes("public upload")) {
    code = "api_audit_required";
  } else if (haystack.includes("ratelimit") || status === 429) {
    code = "rate_limited";
  } else if (haystack.includes("auth") || haystack.includes("token")) {
    code = "token_expired";
  } else if (haystack.includes("permission") || haystack.includes("forbidden") || status === 403) {
    code = "permission_denied";
  } else if (haystack.includes("title") || haystack.includes("description") || haystack.includes("snippet")) {
    code = "invalid_metadata";
  } else if (haystack.includes("video") || haystack.includes("media") || haystack.includes("mime")) {
    code = "invalid_media";
  }

  const retryable = code === "rate_limited" || (status >= 500 && code === "provider_error");
  return new ProviderError({
    code,
    message: humanErrorMessage(PLATFORM, code),
    retryable,
    status,
    responseLog: buildResponseLog(PLATFORM, "youtube-error", status, payload),
  });
}

async function readMyChannel(token: string) {
  const result = await requestJson<{ items?: YouTubeChannel[] }>(
    `${API_BASE}/channels?part=snippet&mine=true`,
    { method: "GET", headers: authHeaders(token) },
    { platform: PLATFORM, endpoint: "GET /youtube/v3/channels?part=snippet&mine=true", mapError: mapYouTubeError },
  );
  const channel = result.data.items?.[0];
  if (!channel?.id) {
    throw new ProviderError({
      code: "permission_denied",
      message: "No YouTube channel is available for this Google account.",
      retryable: false,
      responseLog: result.responseLog,
    });
  }
  return { channel, responseLog: result.responseLog };
}

function bytesBody(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

async function publishVideo(input: PublishInput): Promise<PublishResult> {
  if (input.media.mediaType !== "video") {
    throw new ProviderError({
      code: "invalid_media",
      message: humanErrorMessage(PLATFORM, "invalid_media"),
      retryable: false,
    });
  }

  const settings = settingsOf(input.platformMetadata);
  if (!settings) {
    throw new ProviderError({
      code: "invalid_metadata",
      message: humanErrorMessage(PLATFORM, "invalid_metadata"),
      retryable: false,
    });
  }

  const { bytes, size, mimeType } = await input.readMedia(input.media);
  const privacy = settings.privacy ?? DEFAULT_PRIVACY;
  const metadata = {
    snippet: {
      title: settings.title,
      description: input.caption,
      categoryId: "22",
    },
    status: { privacyStatus: privacy },
  };
  const initialized = await requestJson<null>(
    `${UPLOAD_BASE}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        ...authHeaders(input.accessToken),
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": mimeType,
      },
      body: jsonBody(metadata),
    },
    {
      platform: PLATFORM,
      endpoint: "POST /upload/youtube/v3/videos?uploadType=resumable",
      allowEmptyResponse: true,
      mapError: mapYouTubeError,
    },
  );

  const uploadUrl = initialized.headers.get("location");
  if (!uploadUrl) {
    throw new ProviderError({
      code: "provider_error",
      message: humanErrorMessage(PLATFORM, "provider_error"),
      retryable: false,
      responseLog: initialized.responseLog,
    });
  }

  const uploaded = await requestJson<YouTubeVideo>(
    uploadUrl,
    {
      method: "PUT",
      headers: {
        ...authHeaders(input.accessToken),
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "Content-Range": `bytes 0-${Math.max(0, size - 1)}/${size}`,
      },
      body: bytesBody(bytes),
    },
    {
      platform: PLATFORM,
      endpoint: "PUT {youtube-resumable-upload-url}",
      timeoutMs: 10 * 60_000,
      mapError: mapYouTubeError,
    },
  );

  if (!uploaded.data.id) {
    throw new ProviderError({
      code: "provider_error",
      message: humanErrorMessage(PLATFORM, "provider_error"),
      retryable: false,
      responseLog: uploaded.responseLog,
    });
  }

  return {
    status: "published",
    externalPostId: uploaded.data.id,
    responseLog: buildResponseLog(PLATFORM, "youtube-videos-insert", 200, {
      videoId: uploaded.data.id,
      privacyStatus: privacy,
    }),
  };
}

export const youtubeProvider: SocialProvider = {
  platform: PLATFORM,

  isConfigured(): boolean {
    const { clientId, clientSecret } = serverConfig.youtube;
    return Boolean(clientId && clientSecret);
  },

  async getAuthorizationUrl(input): Promise<string> {
    const { clientId } = serverConfig.youtube;
    return `${AUTHORIZE_URL}?${new URLSearchParams({
      client_id: clientId ?? "",
      redirect_uri: input.redirectUri,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      scope: YOUTUBE_UPLOAD_SCOPE,
      state: signOAuthState({
        userId: input.userId,
        workspaceId: input.workspaceId,
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
    const token = await requestJson<GoogleToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          code: input.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: "authorization_code",
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth2.googleapis.com/token", mapError: mapYouTubeError },
    );

    if (!token.data.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
        responseLog: token.responseLog,
      });
    }

    const { channel } = await readMyChannel(token.data.access_token);
    const title = channel.snippet?.title ?? channel.id ?? "YouTube channel";
    return [{
      platform: PLATFORM,
      platformAccountId: channel.id as string,
      username: title,
      displayName: title,
      avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
      accessToken: token.data.access_token,
      refreshToken: token.data.refresh_token ?? null,
      tokenExpiresAt: tokenExpiry(token.data.expires_in),
      scopes: token.data.scope ?? YOUTUBE_UPLOAD_SCOPE,
      metadata: { channelId: channel.id },
    }];
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

    const token = await requestJson<GoogleToken>(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: decryptSecret(account.encryptedRefreshToken),
          grant_type: "refresh_token",
        }),
      },
      { platform: PLATFORM, endpoint: "POST /oauth2.googleapis.com/token (refresh)", mapError: mapYouTubeError },
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
      await readMyChannel(accountToken(account));
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
    return publishVideo(input);
  },
};

export { mapYouTubeError, settingsOf };
