import "server-only";

import { decryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";
import {
  humanErrorMessage,
  isAuthFailure,
  ProviderError,
  type ErrorCode,
} from "@/lib/errors";
import type { Platform, SocialAccountStatus } from "@/lib/status";
import {
  responseLog as buildResponseLog,
  sleep,
  validateMediaLimits,
  type ProviderResponseLog,
} from "../http";
import type {
  ConnectedAccountDraft,
  MediaAsset,
  PublishInput,
  PublishResult,
  PublishStatusInput,
  PublishStatusResult,
  RefreshResult,
  SocialAccountRecord,
  SocialProvider,
  ValidationResult,
} from "../types";
import {
  createInstagramContainer,
  getInstagramContainerStatus,
  getInstagramUser,
  getMe,
  getVideoStatus,
  publishInstagramContainer,
  publishPagePhoto,
  publishPageVideo,
  toContainerStatus,
  type InstagramContainerStatus,
} from "./graph";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchUserPages,
  metaAuthorizationUrl,
  metaScopesFor,
  readMetaState,
} from "./oauth";

const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 5_000;

function metadataOf(account: SocialAccountRecord): Record<string, unknown> {
  if (
    typeof account.metadata === "object" &&
    account.metadata !== null &&
    !Array.isArray(account.metadata)
  ) {
    return account.metadata as Record<string, unknown>;
  }
  return {};
}

function igUserIdOf(account: SocialAccountRecord): string {
  const { igUserId } = metadataOf(account);
  return typeof igUserId === "string" && igUserId.length > 0
    ? igUserId
    : account.platformAccountId;
}

function pageIdOf(account: SocialAccountRecord): string {
  const { pageId } = metadataOf(account);
  return typeof pageId === "string" && pageId.length > 0
    ? pageId
    : account.platformAccountId;
}

function accountToken(account: SocialAccountRecord): string {
  if (!account.encryptedAccessToken) {
    throw new ProviderError({
      code: "account_needs_reconnect",
      message: humanErrorMessage(account.platform, "account_needs_reconnect"),
      retryable: false,
    });
  }
  return decryptSecret(account.encryptedAccessToken);
}

function failure(platform: Platform, code: ErrorCode): PublishStatusResult {
  return {
    status: "failed",
    errorCode: code,
    message: humanErrorMessage(platform, code),
  };
}

/**
 * Instagram containers are created and then encoded by Meta. We poll a bounded
 * number of times here so most images finish inside `publish()`; anything still
 * encoding is handed back as `accepted` for the worker to resume.
 */
async function waitForContainer(
  token: string,
  containerId: string,
  platform: Platform,
): Promise<InstagramContainerStatus> {
  let status: InstagramContainerStatus = "UNKNOWN";

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(POLL_DELAY_MS);

    const { data } = await getInstagramContainerStatus({
      token,
      platform,
      containerId,
    });

    status = toContainerStatus(data);
    if (
      status === "FINISHED" ||
      status === "ERROR" ||
      status === "EXPIRED"
    ) {
      return status;
    }
  }

  return status;
}

function instagramMediaType(
  media: MediaAsset,
): "IMAGE" | "VIDEO" | "REELS" {
  if (media.mediaType !== "video") return "IMAGE";

  // A portrait clip is published as a Reel; landscape goes to the feed.
  const portrait =
    media.height !== null &&
    media.width !== null &&
    media.height > media.width;

  return portrait ? "REELS" : "VIDEO";
}

async function publishToInstagram(
  input: PublishInput,
): Promise<PublishResult> {
  const platform = input.account.platform;
  const igUserId = igUserIdOf(input.account);
  const mediaUrl = await input.resolveMediaUrl(input.media);

  const container = await createInstagramContainer({
    igUserId,
    token: input.accessToken,
    platform,
    mediaType: instagramMediaType(input.media),
    mediaUrl,
    caption: input.caption,
  });

  const creationId = container.data.id;

  if (!creationId) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(platform, "publish_failed"),
      retryable: false,
      responseLog: container.responseLog,
    });
  }

  const status = await waitForContainer(
    input.accessToken,
    creationId,
    platform,
  );

  if (status === "ERROR" || status === "EXPIRED") {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(platform, "publish_failed"),
      retryable: false,
      responseLog: buildResponseLog(platform, "instagram-container", 200, {
        containerStatus: status,
      }),
    });
  }

  if (status !== "FINISHED") {
    return {
      status: "accepted",
      externalPostId: creationId,
      statusToken: creationId,
      responseLog: buildResponseLog(platform, "instagram-container", 200, {
        creationId,
        containerStatus: status,
      }),
    };
  }

  const published = await publishInstagramContainer({
    igUserId,
    token: input.accessToken,
    platform,
    creationId,
  });

  return {
    status: "published",
    externalPostId: published.data.id ?? creationId,
    responseLog: buildResponseLog(platform, "instagram-publish", 200, {
      creationId,
      mediaId: published.data.id ?? null,
    }),
  };
}

async function publishToFacebook(
  input: PublishInput,
): Promise<PublishResult> {
  const platform = input.account.platform;
  const pageId = pageIdOf(input.account);
  const mediaUrl = await input.resolveMediaUrl(input.media);

  if (input.media.mediaType === "image") {
    const response = await publishPagePhoto({
      pageId,
      token: input.accessToken,
      platform,
      url: mediaUrl,
      message: input.caption,
    });

    if (!response.data.id && !response.data.post_id) {
      throw new ProviderError({
        code: "publish_failed",
        message: humanErrorMessage(platform, "publish_failed"),
        retryable: false,
        responseLog: response.responseLog,
      });
    }

    return {
      status: "published",
      externalPostId: response.data.post_id ?? response.data.id ?? null,
      responseLog: buildResponseLog(platform, "facebook-photo", 200, {
        photoId: response.data.id ?? null,
        postId: response.data.post_id ?? null,
      }),
    };
  }

  const response = await publishPageVideo({
    pageId,
    token: input.accessToken,
    platform,
    fileUrl: mediaUrl,
    description: input.caption,
  });

  if (!response.data.id) {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(platform, "publish_failed"),
      retryable: false,
      responseLog: response.responseLog,
    });
  }

  const videoId = response.data.id;

  // The id exists immediately, but the video itself may still be encoding.
  let log: ProviderResponseLog = buildResponseLog(
    platform,
    "facebook-video",
    200,
    { videoId },
  );
  let state: "ready" | "processing" | "error" | "unknown" = "unknown";

  try {
    const status = await getVideoStatus({
      videoId,
      token: input.accessToken,
      platform,
    });
    state = status.state;
    log = status.responseLog;
  } catch {
    // A status lookup failure never undoes a successful POST: report the post
    // as published and keep the upload's own response log.
  }

  if (state === "error") {
    throw new ProviderError({
      code: "publish_failed",
      message: humanErrorMessage(platform, "publish_failed"),
      retryable: false,
      responseLog: log,
    });
  }

  if (state === "processing") {
    return {
      status: "accepted",
      externalPostId: videoId,
      statusToken: videoId,
      responseLog: log,
    };
  }

  return {
    status: "published",
    externalPostId: videoId,
    responseLog: log,
  };
}

async function checkInstagramStatus(
  input: PublishStatusInput,
): Promise<PublishStatusResult> {
  const platform = input.account.platform;
  const containerId = input.statusToken ?? input.externalPostId;

  if (!containerId) {
    return failure(platform, "publish_failed");
  }

  const { data, responseLog } = await getInstagramContainerStatus({
    token: input.accessToken,
    platform,
    containerId,
  });

  const status = toContainerStatus(data);

  if (status === "ERROR" || status === "EXPIRED") {
    return {
      status: "failed",
      errorCode: "publish_failed",
      message: humanErrorMessage(platform, "publish_failed"),
      responseLog,
    };
  }

  if (status !== "FINISHED") {
    return {
      status: "processing",
      externalPostId: input.externalPostId,
      responseLog,
    };
  }

  const published = await publishInstagramContainer({
    igUserId: igUserIdOf(input.account),
    token: input.accessToken,
    platform,
    creationId: containerId,
  });

  const publishedId = published.data.id ?? containerId;

  return {
    status: "published",
    externalPostId: publishedId,
    responseLog: buildResponseLog(platform, "instagram-publish", 200, {
      creationId: containerId,
      mediaId: publishedId,
    }),
  };
}

async function checkFacebookStatus(
  input: PublishStatusInput,
): Promise<PublishStatusResult> {
  const platform = input.account.platform;
  const videoId = input.statusToken ?? input.externalPostId;

  if (!videoId) {
    return failure(platform, "publish_failed");
  }

  const { state, responseLog } = await getVideoStatus({
    videoId,
    token: input.accessToken,
    platform,
  });

  if (state === "error") {
    return {
      status: "failed",
      errorCode: "publish_failed",
      message: humanErrorMessage(platform, "publish_failed"),
      responseLog,
    };
  }

  if (state === "ready") {
    return { status: "published", externalPostId: videoId, responseLog };
  }

  return { status: "processing", externalPostId: videoId, responseLog };
}

function createMetaProvider(platform: Platform): SocialProvider {
  return {
    platform,

    isConfigured(): boolean {
      const { clientId, clientSecret } = serverConfig.meta;
      return Boolean(clientId && clientSecret);
    },

    async getAuthorizationUrl(input): Promise<string> {
      return metaAuthorizationUrl({
        userId: input.userId,
        platform,
        state: input.state,
        redirectUri: input.redirectUri,
      });
    },

    /**
     * One Meta grant covers the user's Pages and, through them, the Instagram
     * business accounts. We hand back a draft for each so connecting once can
     * light up both platforms.
     */
    async handleCallback(input): Promise<ConnectedAccountDraft[]> {
      const { userId } = readMetaState(input.state, platform);
      if (userId !== input.userId) {
        throw new ProviderError({
          code: "permission_denied",
          message: humanErrorMessage(platform, "permission_denied"),
          retryable: false,
        });
      }

      const shortLived = await exchangeCodeForToken(
        input.code,
        input.redirectUri,
        platform,
      );
      const longLived = await exchangeForLongLivedToken(
        shortLived.accessToken,
        platform,
      );
      const pages = await fetchUserPages(longLived.accessToken, platform);

      const drafts: ConnectedAccountDraft[] = [];

      for (const page of pages) {
        if (!page.id || !page.access_token) continue;

        drafts.push({
          platform: "facebook",
          platformAccountId: page.id,
          displayName: page.name ?? page.id,
          accessToken: page.access_token,
          refreshToken: null,
          tokenExpiresAt: longLived.tokenExpiresAt,
          scopes: metaScopesFor("facebook"),
          metadata: { pageId: page.id },
        });

        const ig = page.instagram_business_account;
        if (ig?.id) {
          drafts.push({
            platform: "instagram",
            platformAccountId: ig.id,
            username: ig.username ?? null,
            displayName: ig.name ?? ig.username ?? null,
            avatarUrl: ig.profile_picture_url ?? null,
            accessToken: page.access_token,
            refreshToken: null,
            tokenExpiresAt: longLived.tokenExpiresAt,
            scopes: metaScopesFor("instagram"),
            metadata: { pageId: page.id, igUserId: ig.id },
          });
        }
      }

      return drafts;
    },

    async refreshToken(account): Promise<RefreshResult> {
      try {
        const current = accountToken(account);
        const refreshed = await exchangeForLongLivedToken(
          current,
          account.platform,
        );
        return {
          accessToken: refreshed.accessToken,
          refreshToken: null,
          tokenExpiresAt: refreshed.tokenExpiresAt,
        };
      } catch (error) {
        if (error instanceof ProviderError && isAuthFailure(error.code)) {
          throw error;
        }

        // Meta has no refresh token: a failed re-exchange means the user has to
        // connect again, which is what `token_expired` communicates upstream.
        throw new ProviderError({
          code: "token_expired",
          message: humanErrorMessage(account.platform, "token_expired"),
          retryable: false,
          cause: error,
        });
      }
    },

    async validateAccount(account): Promise<SocialAccountStatus> {
      try {
        const token = accountToken(account);

        if (account.platform === "instagram") {
          await getInstagramUser(token, igUserIdOf(account), account.platform);
        } else {
          await getMe(token, account.platform);
        }

        return "active";
      } catch (error) {
        if (error instanceof ProviderError) {
          if (isAuthFailure(error.code)) return "needs_reconnect";
          return "active";
        }
        // A transport error says nothing about the account's health.
        return "active";
      }
    },

    async validateContent(input): Promise<ValidationResult> {
      return validateMediaLimits(
        input.account.platform,
        input.media,
        input.caption,
      );
    },

    async publish(input): Promise<PublishResult> {
      return input.account.platform === "instagram"
        ? publishToInstagram(input)
        : publishToFacebook(input);
    },

    async getPublishStatus(input): Promise<PublishStatusResult> {
      return input.account.platform === "instagram"
        ? checkInstagramStatus(input)
        : checkFacebookStatus(input);
    },
  };
}

export const metaInstagramProvider: SocialProvider =
  createMetaProvider("instagram");

export const metaFacebookProvider: SocialProvider =
  createMetaProvider("facebook");
