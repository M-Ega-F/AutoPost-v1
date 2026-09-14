import "server-only";

import { decryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";
import {
  humanErrorMessage,
  isAuthFailure,
  ProviderError,
  type ErrorCode,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { SocialAccountStatus } from "@/lib/status";
import { PLATFORM_LIMITS } from "@/lib/validation/limits";
import {
  formBody,
  jsonBody,
  requestJson,
  responseLog as buildResponseLog,
  signOAuthState,
  uploadBytes,
  validateMediaLimits,
  verifyOAuthState,
  type ProviderResponseLog,
} from "../http";
import type {
  ConnectedAccountDraft,
  PublishInput,
  PublishResult,
  PublishStatusResult,
  RefreshResult,
  SocialAccountRecord,
  SocialProvider,
  ValidationResult,
} from "../types";

const PLATFORM = "tiktok" as const;

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";

const TIKTOK_SCOPES = "user.info.basic,video.upload,video.publish";

/** TikTok wants chunks between 5 MB and 64 MB; a small clip fits in one. */
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

function requireCredentials(): { clientKey: string; clientSecret: string } {
  const { clientKey, clientSecret } = serverConfig.tiktok;
  if (!clientKey || !clientSecret) {
    throw new ProviderError({
      code: "provider_error",
      message: "TikTok is not configured.",
      retryable: false,
    });
  }
  return { clientKey, clientSecret };
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

type TikTokEnvelope<T> = T & {
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

function mapTikTokErrorCode(code: string, message: string): ErrorCode {
  const haystack = `${code} ${message}`.toLowerCase();

  if (
    haystack.includes("access_token") ||
    haystack.includes("token_expired") ||
    haystack.includes("invalid_token") ||
    haystack.includes("token_invalid") ||
    haystack.includes("unauthorized") ||
    haystack.includes("revoke")
  ) {
    return "token_expired";
  }

  if (
    haystack.includes("scope") ||
    haystack.includes("permission") ||
    haystack.includes("not_authorized") ||
    haystack.includes("forbidden") ||
    haystack.includes("copyright") ||
    haystack.includes("spam_risk")
  ) {
    return "permission_denied";
  }

  if (haystack.includes("rate_limit") || haystack.includes("too_many")) {
    return "rate_limited";
  }

  if (
    haystack.includes("unsupported") ||
    haystack.includes("invalid_video") ||
    haystack.includes("invalid_photo") ||
    haystack.includes("invalid_image") ||
    haystack.includes("format") ||
    haystack.includes("resolution") ||
    haystack.includes("dimension")
  ) {
    return "unsupported_media";
  }

  if (haystack.includes("too_large") || haystack.includes("file_size")) {
    return "media_too_large";
  }

  if (haystack.includes("duration") || haystack.includes("too_long")) {
    return "video_too_long";
  }

  if (haystack.includes("caption") || haystack.includes("title")) {
    return "caption_too_long";
  }

  if (
    haystack.includes("url") ||
    haystack.includes("download") ||
    haystack.includes("fetch")
  ) {
    return "url_unreachable";
  }

  return "provider_error";
}

function bearer(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
  };
}

type TikTokTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  open_id?: string;
  token_type?: string;
  error?: { code?: string; message?: string };
};

async function requestTikTokToken(
  params: Record<string, string | number | undefined>,
  endpoint: string,
): Promise<TikTokTokenPayload> {
  const { data, responseLog } = await requestJson<TikTokTokenPayload>(
    `${API_BASE}/oauth/token/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody(params),
    },
    { platform: PLATFORM, endpoint },
  );

  if (data.error?.code) {
    throw new ProviderError({
      code: mapTikTokErrorCode(data.error.code, data.error.message ?? ""),
      message: humanErrorMessage(
        PLATFORM,
        mapTikTokErrorCode(data.error.code, data.error.message ?? ""),
      ),
      retryable: false,
      responseLog,
    });
  }

  return data;
}

type TikTokUserInfo = {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
};

type VideoInitResponse = {
  publish_id?: string;
  upload_url?: string;
};

type StatusResponse = {
  status?: string;
  fail_reason?: string;
  publish_id?: string;
  publicly_available_post_id?: string[];
};

function titleFor(caption: string): string {
  return caption.slice(0, PLATFORM_LIMITS.tiktok.captionLength);
}

/**
 * Only worth retrying as a file upload: TikTok can refuse a URL pull for
 * reasons that say nothing about the account or the content.
 */
function shouldFallbackToFileUpload(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  return (
    error.code !== "token_expired" &&
    error.code !== "permission_denied" &&
    error.code !== "rate_limited" &&
    error.code !== "caption_too_long" &&
    error.code !== "unsupported_media"
  );
}

async function initVideoPost(
  token: string,
  postInfo: Record<string, unknown>,
  sourceInfo: Record<string, unknown>,
  endpoint: string,
): Promise<{ data: VideoInitResponse; responseLog: ProviderResponseLog }> {
  const result = await requestJson<TikTokEnvelope<{ data?: VideoInitResponse }>>(
    `${API_BASE}/post/publish/video/init/`,
    {
      method: "POST",
      headers: bearer(token),
      body: jsonBody({ post_info: postInfo, source_info: sourceInfo }),
    },
    { platform: PLATFORM, endpoint },
  );

  if (result.data.error?.code) {
    throw new ProviderError({
      code: mapTikTokErrorCode(result.data.error.code, result.data.error.message ?? ""),
      message: humanErrorMessage(
        PLATFORM,
        mapTikTokErrorCode(result.data.error.code, result.data.error.message ?? ""),
      ),
      retryable: false,
      status: result.responseLog.status,
      responseLog: result.responseLog,
    });
  }

  return {
    data: result.data.data ?? {},
    responseLog: result.responseLog,
  };
}

async function publishVideo(
  input: PublishInput,
): Promise<PublishResult> {
  const postInfo = {
    title: titleFor(input.caption),
    privacy_level: "PUBLIC_TO_EVERYONE",
    disable_comment: false,
    disable_duet: false,
    disable_stitch: false,
  };

  const mediaUrl = await input.resolveMediaUrl(input.media);

  try {
    const { data, responseLog } = await initVideoPost(
      input.accessToken,
      postInfo,
      { source: "PULL_FROM_URL", video_url: mediaUrl },
      "POST /post/publish/video/init (PULL_FROM_URL)",
    );

    if (!data.publish_id) {
      throw new ProviderError({
        code: "publish_failed",
        message: humanErrorMessage(PLATFORM, "publish_failed"),
        retryable: false,
        responseLog,
      });
    }

    return {
      status: "accepted",
      externalPostId: data.publish_id,
      statusToken: data.publish_id,
      responseLog: buildResponseLog(PLATFORM, "tiktok-video-init", 200, {
        publishId: data.publish_id,
        source: "PULL_FROM_URL",
      }),
    };
  } catch (error) {
    if (!shouldFallbackToFileUpload(error)) throw error;

    logger.warn("tiktok url pull rejected, falling back to file upload", {
      platform: PLATFORM,
      errorCode: error instanceof ProviderError ? error.code : "unknown",
    });
  }

  const { bytes, size } = await input.readMedia(input.media);
  const chunkSize = Math.max(1, Math.min(size, MAX_CHUNK_BYTES));

  const { data, responseLog } = await initVideoPost(
    input.accessToken,
    postInfo,
    {
      source: "FILE_UPLOAD",
      video_size: size,
      chunk_size: chunkSize,
      total_chunk_count: Math.max(1, Math.ceil(size / chunkSize)),
    },
    "POST /post/publish/video/init (FILE_UPLOAD)",
  );

  if (!data.publish_id || !data.upload_url) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(PLATFORM, "publish_failed"),
      retryable: false,
      responseLog,
    });
  }

  await uploadBytes(data.upload_url, bytes, {
    platform: PLATFORM,
    endpoint: "PUT {upload_url}",
    contentType: "video/mp4",
    contentRange: `bytes 0-${Math.max(0, size - 1)}/${size}`,
  });

  return {
    status: "accepted",
    externalPostId: data.publish_id,
    statusToken: data.publish_id,
    responseLog: buildResponseLog(PLATFORM, "tiktok-video-init", 200, {
      publishId: data.publish_id,
      source: "FILE_UPLOAD",
      bytes: size,
    }),
  };
}

async function publishPhoto(
  input: PublishInput,
): Promise<PublishResult> {
  const mediaUrl = await input.resolveMediaUrl(input.media);

  const result = await requestJson<
    TikTokEnvelope<{ data?: { publish_id?: string } }>
  >(
    `${API_BASE}/post/publish/content/init/`,
    {
      method: "POST",
      headers: bearer(input.accessToken),
      body: jsonBody({
        post_info: {
          title: titleFor(input.caption),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_comment: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: [mediaUrl],
        },
        media_type: "PHOTO",
      }),
    },
    { platform: PLATFORM, endpoint: "POST /post/publish/content/init" },
  );

  const publishId = result.data.data?.publish_id;

  if (result.data.error?.code || !publishId) {
    throw new ProviderError({
      code: result.data.error?.code
        ? mapTikTokErrorCode(
            result.data.error.code,
            result.data.error.message ?? "",
          )
        : "publish_failed",
      message: humanErrorMessage(
        PLATFORM,
        result.data.error?.code
          ? mapTikTokErrorCode(
              result.data.error.code,
              result.data.error.message ?? "",
            )
          : "publish_failed",
      ),
      retryable: false,
      responseLog: result.responseLog,
    });
  }

  return {
    status: "accepted",
    externalPostId: publishId,
    statusToken: publishId,
    responseLog: buildResponseLog(PLATFORM, "tiktok-photo-init", 200, {
      publishId,
    }),
  };
}

export const tiktokProvider: SocialProvider = {
  platform: PLATFORM,

  isConfigured(): boolean {
    const { clientKey, clientSecret } = serverConfig.tiktok;
    return Boolean(clientKey && clientSecret);
  },

  async getAuthorizationUrl(input): Promise<string> {
    const { clientKey } = serverConfig.tiktok;

    const params = new URLSearchParams({
      client_key: clientKey ?? "",
      scope: TIKTOK_SCOPES,
      response_type: "code",
      redirect_uri: input.redirectUri,
      state: signOAuthState({
        userId: input.userId,
        workspaceId: input.workspaceId,
        platform: PLATFORM,
        state: input.state,
      }),
    });

    return `${AUTHORIZE_URL}?${params.toString()}`;
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

    const { clientKey, clientSecret } = requireCredentials();

    const token = await requestTikTokToken(
      {
        client_key: clientKey,
        client_secret: clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      },
      "POST /oauth/token (authorization_code)",
    );

    if (!token.access_token || !token.open_id) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
      });
    }

    const userInfo = await requestJson<TikTokEnvelope<{ data?: { user?: TikTokUserInfo } }>>(
      `${API_BASE}/user/info/?fields=open_id,union_id,avatar_url,display_name`,
      { method: "GET", headers: bearer(token.access_token) },
      { platform: PLATFORM, endpoint: "GET /user/info" },
    );

    const user = userInfo.data.data?.user ?? {};
    const openId = user.open_id ?? token.open_id;

    return [
      {
        platform: PLATFORM,
        platformAccountId: openId,
        username: user.display_name ?? null,
        displayName: user.display_name ?? null,
        avatarUrl: user.avatar_url ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt:
          typeof token.expires_in === "number" && token.expires_in > 0
            ? new Date(Date.now() + token.expires_in * 1000)
            : null,
        scopes: token.scope ?? TIKTOK_SCOPES,
        metadata: { unionId: user.union_id ?? null },
      },
    ];
  },

  async refreshToken(account): Promise<RefreshResult> {
    const { clientKey, clientSecret } = requireCredentials();

    if (!account.encryptedRefreshToken) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
      });
    }

    const refreshToken = decryptSecret(account.encryptedRefreshToken);

    const token = await requestTikTokToken(
      {
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
      "POST /oauth/token (refresh_token)",
    );

    if (!token.access_token) {
      throw new ProviderError({
        code: "token_expired",
        message: humanErrorMessage(PLATFORM, "token_expired"),
        retryable: false,
      });
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      tokenExpiresAt:
        typeof token.expires_in === "number" && token.expires_in > 0
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
    };
  },

  async validateAccount(account): Promise<SocialAccountStatus> {
    try {
      const token = accountToken(account);

      await requestJson<TikTokEnvelope<{ data?: { user?: TikTokUserInfo } }>>(
        `${API_BASE}/user/info/?fields=open_id,union_id,avatar_url,display_name`,
        { method: "GET", headers: bearer(token) },
        { platform: PLATFORM, endpoint: "GET /user/info" },
      );

      return "active";
    } catch (error) {
      if (error instanceof ProviderError) {
        if (isAuthFailure(error.code)) return "needs_reconnect";
        return "active";
      }
      return "active";
    }
  },

  async validateContent(input): Promise<ValidationResult> {
    return validateMediaLimits(PLATFORM, input.media, input.caption);
  },

  async publish(input): Promise<PublishResult> {
    return input.media.mediaType === "video"
      ? publishVideo(input)
      : publishPhoto(input);
  },

  async getPublishStatus(input): Promise<PublishStatusResult> {
    const publishId = input.statusToken ?? input.externalPostId;

    if (!publishId) {
      return {
        status: "failed",
        errorCode: "publish_failed",
        message: humanErrorMessage(PLATFORM, "publish_failed"),
      };
    }

    const { data, responseLog } = await requestJson<
      TikTokEnvelope<{ data?: StatusResponse }>
    >(
      `${API_BASE}/post/publish/status/fetch/`,
      {
        method: "POST",
        headers: bearer(input.accessToken),
        body: jsonBody({ publish_id: publishId }),
      },
      { platform: PLATFORM, endpoint: "POST /post/publish/status/fetch" },
    );

    if (data.error?.code) {
      const code = mapTikTokErrorCode(data.error.code, data.error.message ?? "");
      return {
        status: "failed",
        errorCode: code,
        message: humanErrorMessage(PLATFORM, code),
        responseLog,
      };
    }

    const status = data.data?.status?.toUpperCase() ?? "";

    if (status === "PUBLISH_COMPLETE" || status === "POST_PUBLISH_COMPLETE") {
      const externalPostId =
        data.data?.publicly_available_post_id?.[0] ??
        data.data?.publish_id ??
        publishId;

      return { status: "published", externalPostId, responseLog };
    }

    if (status === "FAILED") {
      const code = mapTikTokErrorCode(
        data.data?.fail_reason ?? "",
        data.data?.fail_reason ?? "",
      );

      return {
        status: "failed",
        errorCode: code === "provider_error" ? "publish_failed" : code,
        message: humanErrorMessage(PLATFORM, code),
        responseLog,
      };
    }

    return {
      status: "processing",
      externalPostId: input.externalPostId,
      responseLog,
    };
  },
};
