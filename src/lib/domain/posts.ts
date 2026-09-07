import "server-only";

import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  postExecutions,
  postMedia,
  postPlatforms,
  posts,
  socialAccounts,
  type Post,
  type PostPlatform,
} from "@/lib/db/schema";
import { AppError, humanErrorMessage, isAuthFailure } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { derivePostStatus, type Platform, type PostStatus } from "@/lib/status";
import { getProvider } from "@/providers/social";
import { createSignedMediaUrl, removeMediaObject } from "@/lib/storage";
import { enqueuePublishJob, removePublishJob } from "@/lib/queue/publish";
import {
  accountLabelFor,
  getAccountRecord,
  listAccountSummaries,
} from "@/lib/domain/accounts";
import { MAX_ATTEMPTS } from "@/lib/domain/executions";
import type {
  DashboardData,
  CalendarPost,
  DraftSummary,
  MediaSummary,
  PlatformTarget,
  PostDetail,
  PostSummary,
} from "@/lib/domain/types";
import type { MediaAsset } from "@/providers/social/types";

export type CreatePostMedia = {
  storageKey: string | null;
  sourceUrl: string | null;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export type CreatePostInput = {
  userId: string;
  contentText: string;
  timezone: string;
  scheduledAt: Date | null;
  media: CreatePostMedia;
  targets: Array<{ platform: Platform; socialAccountId: string }>;
};

export type DraftTargetInput = {
  platform: Platform;
  socialAccountId: string;
};

export type DraftInput = {
  postId?: string;
  userId: string;
  contentText: string;
  timezone: string;
  media: CreatePostMedia | null;
  targets: DraftTargetInput[];
};

export type PublishDraftInput = Omit<DraftInput, "postId"> & {
  postId: string;
  scheduledAt: Date | null;
};

function toMediaAsset(media: CreatePostMedia): MediaAsset {
  return {
    mediaType: media.mediaType,
    mimeType: media.mimeType,
    storageKey: media.storageKey,
    sourceUrl: media.sourceUrl,
    fileSize: media.fileSize,
    width: media.width,
    height: media.height,
    duration: media.duration,
  };
}

function assertMediaOwnership(userId: string, media: CreatePostMedia | null): void {
  if (media?.storageKey && !media.storageKey.startsWith(`${userId}/`)) {
    throw new AppError("forbidden", "That media file does not belong to your account.");
  }
}

/**
 * Creates the post, its media row and one target per platform, then enqueues
 * one BullMQ job per target. The transaction commits before publishing starts,
 * so the HTTP response never waits on a social API.
 */
export async function createPost(
  input: CreatePostInput,
): Promise<{ postId: string; status: PostStatus }> {
  assertMediaOwnership(input.userId, input.media);
  if (input.targets.length === 0) {
    throw new AppError(
      "validation_failed",
      "Select at least one platform.",
    );
  }

  const uniquePlatforms = new Set(input.targets.map((t) => t.platform));
  if (uniquePlatforms.size !== input.targets.length) {
    throw new AppError("validation_failed", "Choose one account per platform.");
  }

  const mediaAsset = toMediaAsset(input.media);

  for (const target of input.targets) {
    const account = await getAccountRecord(input.userId, target.socialAccountId);
    if (!account || account.platform !== target.platform) {
      throw new AppError(
        "forbidden",
        "We couldn't find that account. Reconnect it and try again.",
      );
    }
    if (account.status !== "active") {
      throw new AppError(
        "validation_failed",
        humanErrorMessage(target.platform, "account_needs_reconnect"),
      );
    }

    const provider = getProvider(target.platform);
    const validation = await provider.validateContent({
      account,
      media: mediaAsset,
      caption: input.contentText,
    });

    if (!validation.ok) {
      throw new AppError(
        "validation_failed",
        validation.message ||
          humanErrorMessage(target.platform, validation.code),
      );
    }
  }

  const isScheduled = input.scheduledAt !== null;
  const initialStatus: PostStatus = isScheduled ? "scheduled" : "processing";

  const created = await db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        userId: input.userId,
        contentText: input.contentText,
        timezone: input.timezone,
        scheduledAt: input.scheduledAt,
        status: initialStatus,
      })
      .returning({ id: posts.id });

    await tx.insert(postMedia).values({
      postId: post.id,
      storageKey: input.media.storageKey,
      sourceUrl: input.media.sourceUrl,
      mediaType: input.media.mediaType,
      mimeType: input.media.mimeType,
      fileSize: input.media.fileSize,
      width: input.media.width,
      height: input.media.height,
      duration: input.media.duration,
      position: 0,
    });

    const targets = await tx
      .insert(postPlatforms)
      .values(
        input.targets.map((target) => ({
          postId: post.id,
          socialAccountId: target.socialAccountId,
          platform: target.platform,
          status: "pending" as const,
          maxAttempts: MAX_ATTEMPTS,
        })),
      )
      .returning({ id: postPlatforms.id });

    return { postId: post.id, targets };
  });

  // Enqueue outside the transaction: a Redis hiccup must not roll back the post.
  const now = Date.now();
  for (const target of created.targets) {
    const delayMs = input.scheduledAt
      ? Math.max(0, input.scheduledAt.getTime() - now)
      : 0;

    try {
      const jobId = await enqueuePublishJob({
        postPlatformId: target.id,
        attempt: 1,
        delayMs,
        maxAttempts: MAX_ATTEMPTS,
      });

      if (jobId) {
        await db
          .update(postPlatforms)
          .set({ bullmqJobId: jobId, updatedAt: new Date() })
          .where(eq(postPlatforms.id, target.id));
      }
    } catch (error) {
      // Leave the target pending; the worker's recovery sweep picks it up.
      logger.error("enqueue failed", {
        postPlatformId: target.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { postId: created.postId, status: initialStatus };
}

async function cleanupUnreferencedMedia(
  userId: string,
  storageKeys: readonly (string | null)[],
): Promise<void> {
  for (const storageKey of new Set(storageKeys.filter(Boolean))) {
    if (!storageKey || !storageKey.startsWith(`${userId}/`)) continue;

    const [reference] = await db
      .select({ id: postMedia.id })
      .from(postMedia)
      .innerJoin(posts, eq(posts.id, postMedia.postId))
      .where(and(eq(posts.userId, userId), eq(postMedia.storageKey, storageKey)))
      .limit(1);

    if (!reference) await removeMediaObject(storageKey);
  }
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function replaceDraftChildren(
  tx: DbTransaction,
  postId: string,
  media: CreatePostMedia | null,
  targets: DraftTargetInput[],
): Promise<Array<string | null>> {
  const previousMedia = await tx
    .select({ storageKey: postMedia.storageKey })
    .from(postMedia)
    .where(eq(postMedia.postId, postId));

  await tx.delete(postMedia).where(eq(postMedia.postId, postId));
  await tx.delete(postPlatforms).where(eq(postPlatforms.postId, postId));

  if (media) {
    await tx.insert(postMedia).values({
      postId,
      storageKey: media.storageKey,
      sourceUrl: media.sourceUrl,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      width: media.width,
      height: media.height,
      duration: media.duration,
      position: 0,
    });
  }

  if (targets.length > 0) {
    await tx.insert(postPlatforms).values(
      targets.map((target) => ({
        postId,
        socialAccountId: target.socialAccountId,
        platform: target.platform,
        status: "pending" as const,
        maxAttempts: MAX_ATTEMPTS,
      })),
    );
  }

  return previousMedia.map((row) => row.storageKey);
}

/** Saves a draft without provider validation, queueing, or external API calls. */
export async function saveDraft(
  input: DraftInput,
): Promise<{ postId: string; status: "draft" }> {
  assertMediaOwnership(input.userId, input.media);
  const uniquePlatforms = new Set(input.targets.map((target) => target.platform));
  if (uniquePlatforms.size !== input.targets.length) {
    throw new AppError("validation_failed", "Choose one account per platform.");
  }

  const result = await db.transaction(async (tx) => {
    let postId = input.postId;
    if (postId) {
      const [existing] = await tx
        .select({ id: posts.id, status: posts.status })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.userId, input.userId)))
        .limit(1);

      if (!existing) throw new AppError("not_found", "We couldn't find that draft.");
      if (existing.status !== "draft") {
        throw new AppError("validation_failed", "This post is no longer a draft.");
      }

      await tx
        .update(posts)
        .set({
          contentText: input.contentText,
          timezone: input.timezone,
          scheduledAt: null,
          status: "draft",
          cancelledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));
    } else {
      const [created] = await tx
        .insert(posts)
        .values({
          userId: input.userId,
          contentText: input.contentText,
          timezone: input.timezone,
          scheduledAt: null,
          status: "draft",
        })
        .returning({ id: posts.id });
      postId = created.id;
    }

    const oldStorageKeys = await replaceDraftChildren(
      tx,
      postId,
      input.media,
      input.targets,
    );

    return { postId, oldStorageKeys };
  });

  await cleanupUnreferencedMedia(input.userId, result.oldStorageKeys);
  return { postId: result.postId, status: "draft" };
}

/**
 * Converts one existing draft into a normal scheduled/processing post. The
 * draft id is retained, and queue jobs are created only after the transaction
 * commits.
 */
export async function publishDraft(
  input: PublishDraftInput,
): Promise<{ postId: string; status: PostStatus }> {
  assertMediaOwnership(input.userId, input.media);
  if (!input.media) throw new AppError("validation_failed", "Add media before publishing.");
  if (input.targets.length === 0) {
    throw new AppError("validation_failed", "Select at least one platform.");
  }

  const uniquePlatforms = new Set(input.targets.map((target) => target.platform));
  if (uniquePlatforms.size !== input.targets.length) {
    throw new AppError("validation_failed", "Choose one account per platform.");
  }

  const mediaAsset = toMediaAsset(input.media);
  for (const target of input.targets) {
    const account = await getAccountRecord(input.userId, target.socialAccountId);
    if (!account || account.platform !== target.platform) {
      throw new AppError("forbidden", "We couldn't find that account. Reconnect it and try again.");
    }
    if (account.status !== "active") {
      throw new AppError(
        "validation_failed",
        humanErrorMessage(target.platform, "account_needs_reconnect"),
      );
    }

    const validation = await getProvider(target.platform).validateContent({
      account,
      media: mediaAsset,
      caption: input.contentText,
    });
    if (!validation.ok) {
      throw new AppError(
        "validation_failed",
        validation.message || humanErrorMessage(target.platform, validation.code),
      );
    }
  }

  const initialStatus: PostStatus = input.scheduledAt ? "scheduled" : "processing";
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(posts)
      .set({
        contentText: input.contentText,
        timezone: input.timezone,
        scheduledAt: input.scheduledAt,
        status: initialStatus,
        publishedAt: null,
        cancelledAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(posts.id, input.postId),
          eq(posts.userId, input.userId),
          eq(posts.status, "draft"),
        ),
      )
      .returning({ id: posts.id });

    if (!updated) throw new AppError("validation_failed", "This post is no longer a draft.");

    const oldStorageKeys = await replaceDraftChildren(
      tx,
      input.postId,
      input.media,
      input.targets,
    );
    const targets = await tx
      .select({ id: postPlatforms.id })
      .from(postPlatforms)
      .where(eq(postPlatforms.postId, input.postId));

    return { postId: updated.id, targets, oldStorageKeys };
  });

  await cleanupUnreferencedMedia(input.userId, result.oldStorageKeys);

  for (const target of result.targets) {
    const delayMs = input.scheduledAt
      ? Math.max(0, input.scheduledAt.getTime() - Date.now())
      : 0;
    try {
      const jobId = await enqueuePublishJob({
        postPlatformId: target.id,
        attempt: 1,
        delayMs,
        maxAttempts: MAX_ATTEMPTS,
      });
      if (jobId) {
        await db
          .update(postPlatforms)
          .set({ bullmqJobId: jobId, updatedAt: new Date() })
          .where(eq(postPlatforms.id, target.id));
      }
    } catch (error) {
      logger.error("draft publish enqueue failed", {
        postPlatformId: target.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { postId: result.postId, status: initialStatus };
}

export async function listDrafts(userId: string): Promise<DraftSummary[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.status, "draft")))
    .orderBy(desc(posts.updatedAt))
    .limit(100);

  if (rows.length === 0) return [];
  const mediaRows = await db
    .select({ postId: postMedia.postId })
    .from(postMedia)
    .where(inArray(postMedia.postId, rows.map((row) => row.id)));
  const mediaIds = new Set(mediaRows.map((row) => row.postId));
  const summaries = await summarize(rows);
  return summaries.map((summary) => ({ ...summary, hasMedia: mediaIds.has(summary.id) }));
}

export async function getDraftDetail(
  userId: string,
  postId: string,
): Promise<PostDetail | null> {
  const detail = await getPostDetail(userId, postId);
  return detail?.status === "draft" ? detail : null;
}

export async function deleteDraft(userId: string, postId: string): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const [draft] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId), eq(posts.status, "draft")))
      .limit(1);
    if (!draft) throw new AppError("not_found", "We couldn't find that draft.");

    const media = await tx
      .select({ storageKey: postMedia.storageKey })
      .from(postMedia)
      .where(eq(postMedia.postId, postId));
    await tx.delete(posts).where(eq(posts.id, postId));
    return media.map((row) => row.storageKey);
  });

  await cleanupUnreferencedMedia(userId, result);
}

async function loadTargets(
  postIds: string[],
): Promise<Map<string, PlatformTarget[]>> {
  const map = new Map<string, PlatformTarget[]>();
  if (postIds.length === 0) return map;

  const rows = await db
    .select({
      postId: postPlatforms.postId,
      id: postPlatforms.id,
      platform: postPlatforms.platform,
      status: postPlatforms.status,
      attemptCount: postPlatforms.attemptCount,
      maxAttempts: postPlatforms.maxAttempts,
      externalPostId: postPlatforms.externalPostId,
      lastErrorCode: postPlatforms.lastErrorCode,
      publishedAt: postPlatforms.publishedAt,
      accountUsername: socialAccounts.username,
      accountDisplayName: socialAccounts.displayName,
      accountPlatform: socialAccounts.platform,
      accountId: socialAccounts.id,
    })
    .from(postPlatforms)
    .leftJoin(socialAccounts, eq(socialAccounts.id, postPlatforms.socialAccountId))
    .where(inArray(postPlatforms.postId, postIds))
    .orderBy(asc(postPlatforms.createdAt));

  for (const row of rows) {
    const list = map.get(row.postId) ?? [];
    list.push(toPlatformTarget(row));
    map.set(row.postId, list);
  }

  return map;
}

function toPlatformTarget(row: {
  id: string;
  platform: Platform;
  status: PostPlatform["status"];
  attemptCount: number;
  maxAttempts: number;
  externalPostId: string | null;
  lastErrorCode: string | null;
  publishedAt: Date | null;
  accountUsername: string | null;
  accountDisplayName: string | null;
  accountPlatform: Platform | null;
  accountId: string | null;
}): PlatformTarget {
  const errorCode = row.lastErrorCode;
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    externalPostId: row.externalPostId,
    errorCode,
    errorMessage:
      row.status === "failed" && errorCode
        ? humanErrorMessage(row.platform, errorCode)
        : null,
    canRetry: row.status === "failed",
    needsReconnect: row.status === "failed" && isAuthFailure(errorCode),
    accountLabel: row.accountId
      ? accountLabelFor({
          platform: row.accountPlatform ?? row.platform,
          username: row.accountUsername,
          displayName: row.accountDisplayName,
          platformAccountId: row.accountId,
        })
      : null,
    publishedAt: row.publishedAt,
  };
}

function toPostSummary(post: Post, targets: PlatformTarget[]): PostSummary {
  return {
    id: post.id,
    contentText: post.contentText,
    status: post.status,
    timezone: post.timezone,
    scheduledAt: post.scheduledAt,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    platforms: targets,
  };
}

async function summarize(postRows: Post[]): Promise<PostSummary[]> {
  if (postRows.length === 0) return [];
  const targets = await loadTargets(postRows.map((row) => row.id));
  return postRows.map((row) => toPostSummary(row, targets.get(row.id) ?? []));
}

export async function listScheduledPosts(userId: string): Promise<PostSummary[]> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.status, "scheduled")))
    .orderBy(asc(posts.scheduledAt))
    .limit(100);

  return summarize(rows);
}

/** Returns only active schedule-lifecycle posts inside the requested UTC range. */
export async function listCalendarPosts(
  userId: string,
  range: { start: Date; end: Date },
): Promise<CalendarPost[]> {
  if (range.start.getTime() >= range.end.getTime()) return [];

  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        inArray(posts.status, ["scheduled", "processing", "failed", "partial_failure"]),
        gte(posts.scheduledAt, range.start),
        lt(posts.scheduledAt, range.end),
      ),
    )
    .orderBy(asc(posts.scheduledAt), asc(posts.createdAt))
    .limit(500);

  const summaries = await summarize(rows);
  return summaries.flatMap((post) => {
    if (
      post.status !== "scheduled" &&
      post.status !== "processing" &&
      post.status !== "failed" &&
      post.status !== "partial_failure"
    ) {
      return [];
    }
    if (!post.scheduledAt) return [];
    const targets = post.platforms.map((target) => ({
      id: target.id,
      platform: target.platform,
      status: target.status,
      accountLabel: target.accountLabel,
      errorMessage: target.errorMessage,
      canRetry: target.canRetry,
    }));
    const canCancel =
      post.status === "scheduled" ||
      (post.status === "processing" &&
        targets.length > 0 &&
        targets.every((target) => target.status === "pending"));

    return [{
      id: post.id,
      status: post.status,
      scheduledAt: post.scheduledAt,
      timezone: post.timezone,
      captionPreview: post.contentText.slice(0, 100),
      platforms: targets,
      canCancel,
      retryTargetIds: targets
        .filter((target) => target.status === "failed" && target.canRetry)
        .map((target) => target.id),
    }];
  });
}

export async function listHistoryPosts(
  userId: string,
  search?: string,
): Promise<PostSummary[]> {
  const conditions = [
    eq(posts.userId, userId),
    inArray(posts.status, [
      "processing",
      "published",
      "partial_failure",
      "failed",
      "cancelled",
    ]),
  ];

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    conditions.push(sql`${posts.contentText} ilike ${term}`);
  }

  const rows = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`))
    .limit(100);

  return summarize(rows);
}

export async function getPostSummary(
  userId: string,
  postId: string,
): Promise<PostSummary | null> {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!post) return null;

  const targets = await loadTargets([post.id]);
  return toPostSummary(post, targets.get(post.id) ?? []);
}

export async function getPostDetail(
  userId: string,
  postId: string,
): Promise<PostDetail | null> {
  const summary = await getPostSummary(userId, postId);
  if (!summary) return null;

  const [mediaRow] = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, postId))
    .limit(1);

  let media: MediaSummary | null = null;
  if (mediaRow) {
    let previewUrl: string | null = mediaRow.sourceUrl;
    if (!previewUrl && mediaRow.storageKey) {
      try {
        previewUrl = await createSignedMediaUrl(mediaRow.storageKey, 3600);
      } catch {
        previewUrl = null;
      }
    }

    media = {
      id: mediaRow.id,
      mediaType: mediaRow.mediaType,
      mimeType: mediaRow.mimeType,
      fileSize: mediaRow.fileSize,
      width: mediaRow.width,
      height: mediaRow.height,
      duration: mediaRow.duration,
      previewUrl,
      storageKey: mediaRow.storageKey,
      sourceUrl: mediaRow.sourceUrl,
    };
  }

  const executions = await db
    .select()
    .from(postExecutions)
    .innerJoin(postPlatforms, eq(postPlatforms.id, postExecutions.postPlatformId))
    .where(eq(postPlatforms.postId, postId))
    .orderBy(asc(postExecutions.attemptNumber));

  return {
    ...summary,
    media,
    executions: executions.map((row) => ({
      id: row.post_executions.id,
      platform: row.post_executions.platform,
      status: row.post_executions.status,
      attemptNumber: row.post_executions.attemptNumber,
      externalPostId: row.post_executions.externalPostId,
      errorMessage: row.post_executions.errorMessage,
      startedAt: row.post_executions.startedAt,
      executedAt: row.post_executions.executedAt,
    })),
  };
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [
    upcomingRows,
    recentRows,
    attentionRows,
    statusRows,
    connectedAccounts,
  ] = await Promise.all([
    db
      .select()
      .from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.status, "scheduled")))
      .orderBy(asc(posts.scheduledAt))
      .limit(5),
    db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          inArray(posts.status, [
            "processing",
            "published",
            "partial_failure",
            "failed",
          ]),
        ),
      )
      .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`))
      .limit(5),
    db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          or(
            eq(posts.status, "failed"),
            eq(posts.status, "partial_failure"),
          ),
        ),
      )
      .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`))
      .limit(10),
    db
      .select({
        status: posts.status,
        count: sql<number>`count(*)`,
      })
      .from(posts)
      .where(eq(posts.userId, userId))
      .groupBy(posts.status),
    listAccountSummaries(userId),
  ]);

  const [upcoming, recent, attention] = await Promise.all([
    summarize(upcomingRows),
    summarize(recentRows),
    summarize(attentionRows),
  ]);

  const failedTargets = attention
    .flatMap((post) =>
      post.platforms
        .filter((target) => target.status === "failed")
        .map((target) => ({
          postId: post.id,
          caption: post.contentText,
          platformCount: post.platforms.length,
          target,
        })),
    )
    .slice(0, 5);

  const stats = {
    scheduled: 0,
    publishing: 0,
    published: 0,
    failed: 0,
  };

  for (const row of statusRows) {
    const count = Number(row.count);
    if (row.status === "scheduled") stats.scheduled = count;
    if (row.status === "processing") stats.publishing = count;
    if (row.status === "published") stats.published = count;
    if (row.status === "failed" || row.status === "partial_failure") {
      stats.failed += count;
    }
  }

  return {
    upcoming,
    recent,
    stats,
    connectedAccounts,
    failedTargets,
  };
}

export async function cancelScheduledPost(
  userId: string,
  postId: string,
): Promise<void> {
  const jobIds: Array<string | null> = [];

  await db.transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
      .limit(1);

    if (!post) throw new AppError("not_found", "We couldn't find that post.");

    const targets = await tx
      .select({
        id: postPlatforms.id,
        jobId: postPlatforms.bullmqJobId,
        status: postPlatforms.status,
      })
      .from(postPlatforms)
      .where(eq(postPlatforms.postId, postId));

    const canCancelProcessing =
      post.status === "processing" &&
      targets.length > 0 &&
      targets.every((target) => target.status === "pending");

    if (post.status !== "scheduled" && !canCancelProcessing) {
      throw new AppError(
        "validation_failed",
        "Publishing has already started, so this post can no longer be cancelled.",
      );
    }

    jobIds.push(...targets.map((row) => row.jobId));

    await tx
      .update(postPlatforms)
      .set({
        status: "failed",
        lastErrorCode: "cancelled",
        lastErrorMessage: humanErrorMessage("unknown", "cancelled"),
        bullmqJobId: null,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(postPlatforms.postId, postId));

    await tx
      .update(posts)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(posts.id, postId));
  });

  for (const jobId of jobIds) {
    await removePublishJob(jobId);
  }
}

/**
 * Retries one failed platform only. Platforms that already succeeded are never
 * touched, so retrying can never duplicate a published post.
 */
export async function retryPlatform(
  userId: string,
  postPlatformId: string,
): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: postPlatforms.id,
        postId: postPlatforms.postId,
        status: postPlatforms.status,
        attemptCount: postPlatforms.attemptCount,
        maxAttempts: postPlatforms.maxAttempts,
        platform: postPlatforms.platform,
        lastErrorCode: postPlatforms.lastErrorCode,
        jobId: postPlatforms.bullmqJobId,
        postStatus: posts.status,
        scheduledAt: posts.scheduledAt,
        socialAccountId: postPlatforms.socialAccountId,
      })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(
        and(eq(postPlatforms.id, postPlatformId), eq(posts.userId, userId)),
      )
      .limit(1);

    if (!row) throw new AppError("not_found", "We couldn't find that post.");

    if (row.postStatus === "cancelled") {
      throw new AppError(
        "validation_failed",
        "This post was cancelled and can't be retried.",
      );
    }

    if (row.status !== "failed") {
      throw new AppError(
        "validation_failed",
        "This platform is already being retried or has succeeded.",
      );
    }

    const [account] = await tx
      .select({ status: socialAccounts.status })
      .from(socialAccounts)
      .where(eq(socialAccounts.id, row.socialAccountId))
      .limit(1);

    if (account?.status === "disconnected") {
      throw new AppError(
        "validation_failed",
        humanErrorMessage(row.platform, "account_disconnected"),
      );
    }

    if (row.lastErrorCode && isAuthFailure(row.lastErrorCode)) {
      throw new AppError(
        "validation_failed",
        humanErrorMessage(row.platform, "account_needs_reconnect"),
      );
    }

    const attempt = row.attemptCount + 1;

    await tx
      .update(postPlatforms)
      .set({
        status: "pending",
        attemptCount: attempt,
        lastErrorCode: null,
        lastErrorMessage: null,
        lockedAt: null,
        lockedBy: null,
        nextRetryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(postPlatforms.id, postPlatformId));

    await tx
      .update(posts)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(posts.id, row.postId));

    return {
      attempt,
      jobId: row.jobId,
      postPlatformId: row.id,
      maxAttempts: row.maxAttempts,
    };
  });

  await removePublishJob(result.jobId);

  try {
    const jobId = await enqueuePublishJob({
      postPlatformId: result.postPlatformId,
      attempt: result.attempt,
      maxAttempts: result.maxAttempts,
    });

    if (jobId) {
      await db
        .update(postPlatforms)
        .set({ bullmqJobId: jobId, updatedAt: new Date() })
        .where(eq(postPlatforms.id, result.postPlatformId));
    }
  } catch (error) {
    logger.error("retry enqueue failed", {
      postPlatformId: result.postPlatformId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Recomputes `posts.status` from its platform targets. Called by the worker. */
export async function recomputePostStatus(
  postId: string,
  options: { scheduled: boolean },
): Promise<PostStatus> {
  const rows = await db
    .select({ status: postPlatforms.status })
    .from(postPlatforms)
    .where(eq(postPlatforms.postId, postId));

  const next = derivePostStatus(
    rows.map((row) => row.status),
    options,
  );

  const publishedAt =
    next === "published" || next === "partial_failure" ? new Date() : null;

  await db
    .update(posts)
    .set({
      status: next,
      ...(publishedAt ? { publishedAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));

  return next;
}

/**
 * Targets that are waiting but whose time has come — used by the worker's
 * recovery sweep so a Redis outage can never lose a scheduled post.
 */
export async function findDuePendingPlatforms(limit = 100) {
  const rows = await db
    .select({
      id: postPlatforms.id,
      scheduledAt: posts.scheduledAt,
      postStatus: posts.status,
    })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(
      and(
        eq(postPlatforms.status, "pending"),
        eq(posts.status, "scheduled"),
        sql`(${posts.scheduledAt} IS NULL OR ${posts.scheduledAt} <= now())`,
        sql`(${postPlatforms.nextRetryAt} IS NULL OR ${postPlatforms.nextRetryAt} <= now())`,
      ),
    )
    .orderBy(asc(posts.scheduledAt))
    .limit(limit);

  return rows;
}

export async function findPendingImmediatePlatforms(limit = 100) {
  const rows = await db
    .select({ id: postPlatforms.id })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(
      and(
        eq(postPlatforms.status, "pending"),
        inArray(posts.status, ["processing"]),
        sql`(${postPlatforms.nextRetryAt} IS NULL OR ${postPlatforms.nextRetryAt} <= now())`,
      ),
    )
    .limit(limit);

  return rows;
}

export async function markPlatformQueued(
  postPlatformId: string,
  jobId: string | undefined,
): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ bullmqJobId: jobId ?? null, nextRetryAt: null, updatedAt: new Date() })
    .where(eq(postPlatforms.id, postPlatformId));
}
