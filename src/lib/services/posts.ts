import "server-only";

import { AppError, PLATFORM_LABELS } from "@/lib/errors";
import {
  cancelScheduledPost,
  createPost,
  deleteDraft,
  getDashboardData,
  getDraftDetail,
  getPostDetail,
  getPostSummary,
  listDrafts,
  listHistoryPosts,
  listHistoryPostsPage,
  listScheduledPosts,
  publishDraft,
  retryPlatform,
  saveDraft,
} from "@/lib/domain/posts";
import { listActiveAccounts } from "@/lib/domain/accounts";
import { getMediaAssetRowForUser } from "@/lib/domain/media";
import {
  getAnalyticsOverview,
  getPostAnalyticsDetail,
  listAnalyticsTargetIds,
  listAnalyticsSnapshots,
  saveAnalyticsSnapshot,
  syncPostPlatformAnalytics,
  type AnalyticsRange,
  type AnalyticsSnapshotInput,
} from "@/lib/domain/analytics";
import type {
  DashboardData,
  DraftSummary,
  PostDetail,
  PostSummary,
  HistoryQuery,
  PaginatedPosts,
} from "@/lib/domain/types";
import { zonedTimeToUtc } from "@/lib/time";
import type { Platform, PostStatus } from "@/lib/status";
import type {
  CreatePostInput,
  PostMediaInput,
  SaveDraftInput,
} from "@/lib/validation/schemas";

export type PostListScope = "history" | "scheduled" | "all";

function resolveTargets(
  platforms: readonly Platform[],
  accounts: Awaited<ReturnType<typeof listActiveAccounts>>,
): Array<{ platform: Platform; socialAccountId: string }> {
  const byPlatform = new Map(accounts.map((account) => [account.platform, account]));
  return platforms.map((platform) => {
    const account = byPlatform.get(platform);
    if (!account) {
      throw new AppError(
        "forbidden",
        `Your ${PLATFORM_LABELS[platform] ?? "platform"} account is no longer connected.`,
      );
    }
    return { platform, socialAccountId: account.id };
  });
}

async function toDomainMedia(userId: string, media: PostMediaInput) {
  if (media.kind === "library") {
    const asset = await getMediaAssetRowForUser(userId, media.assetId ?? "");
    return {
      storageKey: asset.storageKey,
      sourceUrl: null,
      mediaType: asset.mediaType,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
    };
  }
  return {
    storageKey: media.storageKey,
    sourceUrl: media.kind === "url" ? media.sourceUrl ?? null : null,
    mediaType: media.mediaType,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    width: media.width,
    height: media.height,
    duration: media.duration,
  };
}

export async function createPostForUser(
  userId: string,
  input: CreatePostInput,
): Promise<{ postId: string; status: PostStatus }> {
  const accounts = await listActiveAccounts(userId);
  const targets = resolveTargets(input.platforms, accounts);

  let scheduledAt: Date | null = null;
  if (input.schedule) {
    try {
      scheduledAt = zonedTimeToUtc(
        input.schedule.date,
        input.schedule.time,
        input.schedule.timezone,
      );
    } catch {
      throw new AppError("validation_failed", "Choose a valid schedule.");
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError("validation_failed", "Choose a time in the future.");
    }
  }

  return createPost({
    userId,
    contentText: input.caption,
    timezone: input.schedule?.timezone ?? "UTC",
    scheduledAt,
    media: await toDomainMedia(userId, input.media),
    targets,
  });
}

export type DraftPayload = {
  postId?: string;
  caption: string;
  media: PostMediaInput | null;
  platforms: Platform[];
  timezone: string;
};

export async function saveDraftForUser(
  userId: string,
  input: SaveDraftInput & { postId?: string },
): Promise<{ postId: string; status: "draft" }> {
  const accounts = await listActiveAccounts(userId);
  return saveDraft({
    postId: input.postId,
    userId,
    contentText: input.caption,
    timezone: input.timezone,
    media: input.media ? await toDomainMedia(userId, input.media) : null,
    targets: resolveTargets(input.platforms, accounts),
  });
}

export async function publishDraftForUser(
  userId: string,
  postId: string,
  input: CreatePostInput,
): Promise<{ postId: string; status: PostStatus }> {
  const accounts = await listActiveAccounts(userId);
  let scheduledAt: Date | null = null;
  if (input.schedule) {
    try {
      scheduledAt = zonedTimeToUtc(
        input.schedule.date,
        input.schedule.time,
        input.schedule.timezone,
      );
    } catch {
      throw new AppError("validation_failed", "Choose a valid schedule.");
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError("validation_failed", "Choose a time in the future.");
    }
  }

  return publishDraft({
    postId,
    userId,
    contentText: input.caption,
    timezone: input.schedule?.timezone ?? "UTC",
    scheduledAt,
    media: await toDomainMedia(userId, input.media),
    targets: resolveTargets(input.platforms, accounts),
  });
}

export function listDraftsForUser(userId: string): Promise<DraftSummary[]> {
  return listDrafts(userId);
}

export function listHistoryPostsForUser(
  userId: string,
  query: HistoryQuery,
  timezone = "UTC",
): Promise<PaginatedPosts> {
  return listHistoryPostsPage(userId, query, timezone);
}

export function getDraftDetailForUser(
  userId: string,
  postId: string,
): Promise<PostDetail | null> {
  return getDraftDetail(userId, postId);
}

export function deleteDraftForUser(userId: string, postId: string): Promise<void> {
  return deleteDraft(userId, postId);
}

export async function listPostsForUser(
  userId: string,
  scope: PostListScope = "history",
  search?: string,
): Promise<PostSummary[]> {
  if (scope === "scheduled") return listScheduledPosts(userId);
  if (scope === "history") return listHistoryPosts(userId, search);
  // History is the complete lifecycle view, so `all` must not append the
  // scheduled subset a second time.
  return listHistoryPosts(userId, search);
}

export function getPostForUser(userId: string, postId: string): Promise<PostSummary | null> {
  return getPostSummary(userId, postId);
}

export function getPostDetailForUser(
  userId: string,
  postId: string,
): Promise<PostDetail | null> {
  return getPostDetail(userId, postId);
}

export function cancelPostForUser(userId: string, postId: string): Promise<void> {
  return cancelScheduledPost(userId, postId);
}

export function retryPostPlatformForUser(
  userId: string,
  postPlatformId: string,
  postId?: string,
): Promise<void> {
  return (async () => {
    if (postId) {
      const post = await getPostSummary(userId, postId);
      if (!post || !post.platforms.some((target) => target.id === postPlatformId)) {
        throw new AppError("not_found", "We couldn't find that post.");
      }
    }
    await retryPlatform(userId, postPlatformId);
  })();
}

export function getDashboardForUser(userId: string): Promise<DashboardData> {
  return getDashboardData(userId);
}

export function getAnalyticsForUser(
  userId: string,
  options: { range?: AnalyticsRange; platform?: Platform; timeZone?: string } = {},
) {
  return getAnalyticsOverview(userId, options);
}

export function getPostAnalyticsForUser(userId: string, postId: string) {
  return getPostAnalyticsDetail(userId, postId);
}

export function listAnalyticsTargetIdsForUser(userId: string, platform?: Platform) {
  return listAnalyticsTargetIds(userId, platform);
}

export function listAnalyticsForUser(
  userId: string,
  options: { range?: AnalyticsRange; platform?: Platform; postId?: string; timeZone?: string } = {},
) {
  return listAnalyticsSnapshots(userId, options);
}

export function saveAnalyticsForUser(
  userId: string,
  input: AnalyticsSnapshotInput,
) {
  return saveAnalyticsSnapshot(userId, input);
}

export { syncPostPlatformAnalytics };
