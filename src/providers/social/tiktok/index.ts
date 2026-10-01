import "server-only";

import { isIP } from "node:net";

import { decryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";
import { isBlockedAddress, isBlockedHostname } from "@/lib/media/fetch-url";
import {
  humanErrorMessage,
  isAuthFailure,
  ProviderError,
  type ErrorCode,
} from "@/lib/errors";
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
import { validationError } from "../types";

const PLATFORM = "tiktok" as const;

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";

const TIKTOK_SCOPES = "user.info.basic,video.upload,video.publish";

/** TikTok wants chunks between 5 MB and 64 MB; a small clip fits in one. */
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const TIKTOK_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const TIKTOK_PHOTO_MAX_DIMENSION = 1080;
const TIKTOK_PHOTO_TITLE_MAX_LENGTH = 90;
const TIKTOK_PHOTO_MIME_TYPES = ["image/jpeg", "image/webp"] as const;

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

type TikTokCreatorInfo = {
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

function hasTikTokError(error: TikTokEnvelope<unknown>["error"]): boolean {
  return Boolean(error?.code && error.code.toLowerCase() !== "ok");
}

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

  const error = data.error;
  if (hasTikTokError(error)) {
    throw new ProviderError({
      code: mapTikTokErrorCode(error?.code ?? "", error?.message ?? ""),
      message: humanErrorMessage(
        PLATFORM,
        mapTikTokErrorCode(error?.code ?? "", error?.message ?? ""),
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

function photoTitleFor(caption: string): string {
  return caption.slice(0, TIKTOK_PHOTO_TITLE_MAX_LENGTH);
}

function validateTikTokPhotoMedia(input: {
  media: PublishInput["media"];
  caption: string;
}): ValidationResult {
  const generic = validateMediaLimits(PLATFORM, input.media, input.caption);
  if (!generic.ok) return generic;
  if (input.media.mediaType !== "image") return { ok: true };

  if (!(TIKTOK_PHOTO_MIME_TYPES as readonly string[]).includes(input.media.mimeType)) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(PLATFORM, "unsupported_media"),
    );
  }

  if (
    input.media.fileSize !== null &&
    input.media.fileSize > TIKTOK_PHOTO_MAX_BYTES
  ) {
    return validationError(
      "media_too_large",
      humanErrorMessage(PLATFORM, "media_too_large"),
    );
  }

  if (
    (input.media.width !== null && input.media.width > TIKTOK_PHOTO_MAX_DIMENSION) ||
    (input.media.height !== null && input.media.height > TIKTOK_PHOTO_MAX_DIMENSION)
  ) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(PLATFORM, "unsupported_media"),
    );
  }

  return { ok: true };
}

function assertValidTikTokPhotoMedia(input: PublishInput): void {
  const validation = validateTikTokPhotoMedia(input);
  if (!validation.ok) {
    throw new ProviderError({
      code: validation.code,
      message: validation.message,
      retryable: false,
    });
  }
}

function buildPhotoPostInfo(
  input: PublishInput,
  creatorInfo: TikTokCreatorInfo,
): Record<string, unknown> {
  const privacyLevel = "SELF_ONLY";
  if (!creatorInfo.privacy_level_options?.includes(privacyLevel)) {
    throw new ProviderError({
      code: "provider_error",
      message: "TikTok does not allow the default privacy setting for this account.",
      retryable: false,
    });
  }

  return {
    title: photoTitleFor(input.caption),
    privacy_level: privacyLevel,
    disable_comment: creatorInfo.comment_disabled === true,
  };
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

  const error = result.data.error;
  if (hasTikTokError(error)) {
    throw new ProviderError({
      code: mapTikTokErrorCode(error?.code ?? "", error?.message ?? ""),
      message: humanErrorMessage(
        PLATFORM,
        mapTikTokErrorCode(error?.code ?? "", error?.message ?? ""),
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

async function queryCreatorInfo(
  token: string,
): Promise<TikTokCreatorInfo> {
  const result = await requestJson<TikTokEnvelope<{ data?: TikTokCreatorInfo }>>(
    `${API_BASE}/post/publish/creator_info/query/`,
    {
      method: "POST",
      headers: bearer(token),
    },
    { platform: PLATFORM, endpoint: "POST /post/publish/creator_info/query" },
  );

  if (hasTikTokError(result.data.error)) {
    const code = mapTikTokErrorCode(
      result.data.error?.code ?? "",
      result.data.error?.message ?? "",
    );
    throw new ProviderError({
      code,
      message: humanErrorMessage(PLATFORM, code),
      retryable: false,
      status: result.responseLog.status,
      responseLog: result.responseLog,
    });
  }

  return result.data.data ?? {};
}

function buildVideoPostInfo(
  input: PublishInput,
  creatorInfo: TikTokCreatorInfo,
): Record<string, unknown> {
  const privacyLevel = "SELF_ONLY";
  if (!creatorInfo.privacy_level_options?.includes(privacyLevel)) {
    throw new ProviderError({
      code: "provider_error",
      message: "TikTok does not allow the default privacy setting for this account.",
      retryable: false,
    });
  }

  const maxDuration = creatorInfo.max_video_post_duration_sec;
  if (
    typeof maxDuration === "number" &&
    input.media.duration !== null &&
    input.media.duration !== undefined &&
    input.media.duration > maxDuration
  ) {
    throw new ProviderError({
      code: "video_too_long",
      message: humanErrorMessage(PLATFORM, "video_too_long"),
      retryable: false,
    });
  }

  return {
    title: titleFor(input.caption),
    privacy_level: privacyLevel,
    disable_comment: creatorInfo.comment_disabled === true,
    disable_duet: creatorInfo.duet_disabled === true,
    disable_stitch: creatorInfo.stitch_disabled === true,
  };
}

function validatePullUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderError({
      code: "invalid_media_url",
      message: humanErrorMessage(PLATFORM, "invalid_media_url"),
      retryable: false,
    });
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    isBlockedHostname(parsed.hostname) ||
    (isIP(parsed.hostname) !== 0 && isBlockedAddress(parsed.hostname))
  ) {
    throw new ProviderError({
      code: parsed.protocol === "https:" ? "url_blocked" : "invalid_media_url",
      message: humanErrorMessage(PLATFORM, "invalid_media_url"),
      retryable: false,
    });
  }
}

function uploadContentType(mimeType: string): string {
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  if (
    normalized === "video/mp4" ||
    normalized === "video/quicktime"
  ) {
    return normalized;
  }

  throw new ProviderError({
    code: "unsupported_media",
    message: humanErrorMessage(PLATFORM, "unsupported_media"),
    retryable: false,
  });
}

async function uploadFile(
  uploadUrl: string,
  bytes: Uint8Array,
  size: number,
  mimeType: string,
): Promise<void> {
  if (size <= 0 || bytes.byteLength !== size) {
    throw new ProviderError({
      code: "unsupported_media",
      message: humanErrorMessage(PLATFORM, "unsupported_media"),
      retryable: false,
    });
  }

  const chunkSize = Math.min(size, MAX_CHUNK_BYTES);
  for (let start = 0; start < size; start += chunkSize) {
    const endExclusive = Math.min(size, start + chunkSize);
    const chunk = bytes.subarray(start, endExclusive);
    await uploadBytes(uploadUrl, chunk, {
      platform: PLATFORM,
      endpoint: "PUT {upload_url}",
      contentType: mimeType,
      contentRange: `bytes ${start}-${endExclusive - 1}/${size}`,
    });
  }
}

async function publishVideo(
  input: PublishInput,
): Promise<PublishResult> {
  const creatorInfo = await queryCreatorInfo(input.accessToken);
  const postInfo = buildVideoPostInfo(input, creatorInfo);

  if (input.media.storageKey) {
    const media = await input.readMedia(input.media);
    const { data, responseLog } = await initVideoPost(
      input.accessToken,
      postInfo,
      {
        source: "FILE_UPLOAD",
        video_size: media.size,
        chunk_size: Math.min(media.size, MAX_CHUNK_BYTES),
        total_chunk_count: Math.max(
          1,
          Math.ceil(media.size / Math.min(media.size, MAX_CHUNK_BYTES)),
        ),
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

    await uploadFile(
      data.upload_url,
      media.bytes,
      media.size,
      uploadContentType(media.mimeType),
    );

    return {
      status: "accepted",
      externalPostId: data.publish_id,
      statusToken: data.publish_id,
      responseLog: buildResponseLog(PLATFORM, "tiktok-video-init", 200, {
        publishId: data.publish_id,
        source: "FILE_UPLOAD",
        bytes: media.size,
      }),
    };
  }

  const mediaUrl = await input.resolveMediaUrl(input.media);
  validatePullUrl(mediaUrl);

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
}

async function publishPhoto(
  input: PublishInput,
): Promise<PublishResult> {
  assertValidTikTokPhotoMedia(input);
  const creatorInfo = await queryCreatorInfo(input.accessToken);
  const postInfo = buildPhotoPostInfo(input, creatorInfo);

  const mediaUrl = input.media.storageKey
    ? await input.resolveTikTokPhotoMediaUrl?.(input.media)
    : await input.resolveMediaUrl(input.media);

  if (!mediaUrl) {
    throw new ProviderError({
      code: "invalid_media_url",
      message: humanErrorMessage(PLATFORM, "invalid_media_url"),
      retryable: false,
    });
  }
  validatePullUrl(mediaUrl);

  const result = await requestJson<
    TikTokEnvelope<{ data?: { publish_id?: string } }>
  >(
    `${API_BASE}/post/publish/content/init/`,
    {
      method: "POST",
      headers: bearer(input.accessToken),
      body: jsonBody({
        post_mode: "DIRECT_POST",
        post_info: postInfo,
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

  const hasError = hasTikTokError(result.data.error);
  if (hasError || !publishId) {
    throw new ProviderError({
      code: hasError
        ? mapTikTokErrorCode(result.data.error?.code ?? "", result.data.error?.message ?? "")
        : "publish_failed",
      message: humanErrorMessage(
        PLATFORM,
        hasError
          ? mapTikTokErrorCode(result.data.error?.code ?? "", result.data.error?.message ?? "")
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
    return validateTikTokPhotoMedia(input);
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

    const error = data.error;
    if (hasTikTokError(error)) {
      const code = mapTikTokErrorCode(error?.code ?? "", error?.message ?? "");
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
