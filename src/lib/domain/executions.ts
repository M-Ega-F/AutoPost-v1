import "server-only";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  postExecutions,
  postMedia,
  postPlatforms,
  posts,
  socialAccounts,
  type PostPlatform,
  type PostMedia,
  type Post,
} from "@/lib/db/schema";
import { sanitize } from "@/lib/logger";
import type { SocialAccountRecord, MediaAsset } from "@/providers/social/types";

/** How long a `processing` row may stay locked before another worker takes it. */
export const STALE_LOCK_MINUTES = 5;
export const MAX_ATTEMPTS = 3;

export type PublishContext = {
  postPlatform: PostPlatform;
  post: Post;
  media: MediaAsset;
  account: SocialAccountRecord;
};

export type ClaimOutcome =
  | { claimed: true; context: PublishContext }
  | { claimed: false; reason: string };

/**
 * Atomically takes ownership of one platform target.
 *
 * `pending → processing` happens inside a single UPDATE, so two workers can
 * never both claim the same execution. A row left in `processing` with a stale
 * lock is reclaimable, which is how crashed workers are recovered from.
 */
export async function claimPlatformForPublish(
  postPlatformId: string,
  workerId: string,
): Promise<ClaimOutcome> {
  return db.transaction(async (tx) => {
    // A single atomic UPDATE ... RETURNING is the concurrency guard: two
    // workers can never both claim the same target, and a `processing` row
    // whose lock went stale is reclaimable so a crashed worker cannot strand
    // a job forever.
    //
    // Built with the query builder rather than raw SQL: `execute()` returns
    // unmapped rows keyed by their database column names (`post_id`), which
    // would silently read as `undefined` through the camelCase types below.
    const claimed = await tx
      .update(postPlatforms)
      .set({
        status: "processing",
        lockedAt: new Date(),
        lockedBy: workerId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(postPlatforms.id, postPlatformId),
          or(
            eq(postPlatforms.status, "pending"),
            and(
              eq(postPlatforms.status, "processing"),
              or(
                isNull(postPlatforms.lockedAt),
                lt(
                  postPlatforms.lockedAt,
                  sql`now() - ${`${STALE_LOCK_MINUTES} minutes`}::interval`,
                ),
              ),
            ),
          ),
        ),
      )
      .returning();

    const claimedRow = claimed[0];

    if (!claimedRow) {
      return { claimed: false, reason: "already-claimed-or-terminal" };
    }

    const [post] = await tx
      .select()
      .from(posts)
      .where(eq(posts.id, claimedRow.postId))
      .limit(1);

    if (!post) {
      return { claimed: false, reason: "post-missing" };
    }

    // The database is the source of truth: a post cancelled while the job was
    // waiting must never be published.
    if (post.status === "cancelled") {
      await tx
        .update(postPlatforms)
        .set({
          status: "failed",
          lastErrorCode: "cancelled",
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(postPlatforms.id, postPlatformId));
      return { claimed: false, reason: "post-cancelled" };
    }

    const [accountRow] = await tx
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, claimedRow.socialAccountId))
      .limit(1);

    if (!accountRow) {
      return { claimed: false, reason: "account-missing" };
    }

    const [mediaRow] = await tx
      .select()
      .from(postMedia)
      .where(eq(postMedia.postId, post.id))
      .limit(1);

    if (!mediaRow) {
      return { claimed: false, reason: "media-missing" };
    }

    return {
      claimed: true,
      context: {
        postPlatform: claimedRow,
        post,
        media: toMediaAsset(mediaRow),
        account: {
          id: accountRow.id,
          userId: accountRow.userId,
          platform: accountRow.platform,
          platformAccountId: accountRow.platformAccountId,
          username: accountRow.username,
          displayName: accountRow.displayName,
          avatarUrl: accountRow.avatarUrl,
          encryptedAccessToken: accountRow.encryptedAccessToken,
          encryptedRefreshToken: accountRow.encryptedRefreshToken,
          tokenExpiresAt: accountRow.tokenExpiresAt,
          scopes: accountRow.scopes,
          status: accountRow.status,
          lastErrorCode: accountRow.lastErrorCode,
          lastErrorMessage: accountRow.lastErrorMessage,
          metadata: accountRow.metadata,
        },
      },
    };
  });
}

export function toMediaAsset(row: PostMedia): MediaAsset {
  return {
    mediaType: row.mediaType,
    mimeType: row.mimeType,
    storageKey: row.storageKey,
    sourceUrl: row.sourceUrl,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    duration: row.duration,
  };
}

export async function releaseClaim(postPlatformId: string): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(eq(postPlatforms.id, postPlatformId));
}

export async function startExecution(input: {
  postPlatformId: string;
  platform: PostPlatform["platform"];
  attemptNumber: number;
  bullmqJobId: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(postExecutions)
    .values({
      postPlatformId: input.postPlatformId,
      platform: input.platform,
      status: "processing",
      attemptNumber: input.attemptNumber,
      bullmqJobId: input.bullmqJobId,
      startedAt: new Date(),
    })
    .returning({ id: postExecutions.id });

  return row.id;
}

export async function finishExecutionAccepted(
  executionId: string,
  responseLog?: unknown,
): Promise<void> {
  await db
    .update(postExecutions)
    .set({
      status: "accepted",
      executedAt: new Date(),
      responseLog: (sanitize(responseLog) ?? null) as never,
    })
    .where(eq(postExecutions.id, executionId));
}

export async function finishExecutionPublished(
  executionId: string,
  externalPostId: string | null,
  responseLog?: unknown,
): Promise<void> {
  await db
    .update(postExecutions)
    .set({
      status: "published",
      externalPostId,
      executedAt: new Date(),
      responseLog: (sanitize(responseLog) ?? null) as never,
    })
    .where(eq(postExecutions.id, executionId));
}

export async function finishExecutionFailed(
  executionId: string,
  error: { code: string; message: string; responseLog?: unknown },
): Promise<void> {
  await db
    .update(postExecutions)
    .set({
      status: "failed",
      errorCode: error.code,
      errorMessage: error.message,
      executedAt: new Date(),
      responseLog: (sanitize(error.responseLog) ?? null) as never,
    })
    .where(eq(postExecutions.id, executionId));
}

export async function countExecutions(postPlatformId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postExecutions)
    .where(eq(postExecutions.postPlatformId, postPlatformId));

  return row?.count ?? 0;
}

export async function latestExecutionLog(
  postPlatformId: string,
): Promise<unknown> {
  const [row] = await db
    .select({ responseLog: postExecutions.responseLog })
    .from(postExecutions)
    .where(eq(postExecutions.postPlatformId, postPlatformId))
    .orderBy(sql`${postExecutions.attemptNumber} desc`)
    .limit(1);

  return row?.responseLog ?? null;
}

export async function findStalledPlatformIds(): Promise<string[]> {
  const rows = await db
    .select({ id: postPlatforms.id })
    .from(postPlatforms)
    .where(
      and(
        eq(postPlatforms.status, "processing"),
        sql`${postPlatforms.lockedAt} IS NOT NULL`,
        sql`${postPlatforms.lockedAt} < now() - ${`${STALE_LOCK_MINUTES} minutes`}::interval`,
      ),
    );

  return rows.map((row) => row.id);
}

/** Exponential backoff used for manual retries and the recovery sweep. */
export function backoffDelayMs(attempt: number): number {
  const base = 15_000;
  const delay = base * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, 30 * 60_000);
}
