import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { eq } from "drizzle-orm";

import { decryptSecret } from "@/lib/crypto/tokens";
import {
  disconnectAccount,
  listAccountSummaries,
  saveConnectedAccounts,
} from "@/lib/domain/accounts";
import {
  createPost,
  getPostDetail,
  getPostSummary,
  listHistoryPosts,
  listScheduledPosts,
  recomputePostStatus,
  retryPlatform,
} from "@/lib/domain/posts";
import { postMedia, postPlatforms, posts, socialAccounts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { Platform, PostPlatformStatus, PostStatus } from "@/lib/status";

import { db, seedUser } from "./db-harness";
import {
  createAccount,
  getAccountRow,
  getPostRow,
  getTargetRow,
  insertPost,
  insertTarget,
  OTHER_USER_ID,
  setupTestDatabase,
  TEST_MEDIA,
  USER_ID,
} from "./fixtures";
import { enqueued, jobsFor, removed } from "./fake-queue";

/**
 * Domain-level integration tests for the post lifecycle: create, schedule,
 * enqueue, retry, status recomputation, ownership and account disconnection.
 *
 * `tests/register.ts` has already swapped the database, queue and providers for
 * their doubles, so everything below runs against real SQL with no network.
 */

beforeEach(async () => {
  await setupTestDatabase();
  // Foreign keys point at auth.users; `setupTestDatabase` only seeds USER_ID.
  await seedUser(OTHER_USER_ID);
});

function inTheFuture(ms = 2 * 60 * 60_000): Date {
  return new Date(Date.now() + ms);
}

async function postCount(): Promise<number> {
  const rows = await db.select({ id: posts.id }).from(posts);
  return rows.length;
}

async function mediaRowsFor(postId: string) {
  return db.select().from(postMedia).where(eq(postMedia.postId, postId));
}

async function targetRowsFor(postId: string) {
  return db.select().from(postPlatforms).where(eq(postPlatforms.postId, postId));
}

async function setTargetError(id: string, code: string | null): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ lastErrorCode: code })
    .where(eq(postPlatforms.id, id));
}

async function setTargetJobId(id: string, jobId: string | null): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ bullmqJobId: jobId })
    .where(eq(postPlatforms.id, id));
}

async function setTargetAttempts(id: string, attemptCount: number): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ attemptCount })
    .where(eq(postPlatforms.id, id));
}

async function setTargetLock(id: string, worker: string): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ lockedAt: new Date(), lockedBy: worker })
    .where(eq(postPlatforms.id, id));
}

function rowFor<T extends { platform: Platform }>(
  rows: readonly T[],
  platform: Platform,
): T {
  const row = rows.find((candidate) => candidate.platform === platform);
  assert.ok(row, `expected a ${platform} row`);
  return row;
}

/** One post with one target per requested platform, each at a chosen status. */
async function buildPost(
  plan: Array<{ platform: Platform; status: PostPlatformStatus }>,
  options: { postStatus?: PostStatus; scheduledAt?: Date | null; caption?: string } = {},
): Promise<{ postId: string; targetId: (platform: Platform) => string }> {
  const postId = await insertPost({
    status: options.postStatus ?? "processing",
    scheduledAt: options.scheduledAt ?? null,
    caption: options.caption,
  });

  const ids = new Map<Platform, string>();
  for (const entry of plan) {
    const accountId = await createAccount(entry.platform);
    const targetId = await insertTarget(postId, accountId, entry.platform, {
      status: entry.status,
    });
    ids.set(entry.platform, targetId);
  }

  return {
    postId,
    targetId: (platform) => {
      const id = ids.get(platform);
      assert.ok(id, `no ${platform} target was created`);
      return id;
    },
  };
}

/** Instagram failed, Facebook and TikTok succeeded — Plan section 42's scenario. */
async function buildPartialFailurePost(
  options: { postStatus?: PostStatus } = {},
): Promise<{ postId: string; targetId: (platform: Platform) => string }> {
  return buildPost(
    [
      { platform: "instagram", status: "failed" },
      { platform: "facebook", status: "success" },
      { platform: "tiktok", status: "success" },
    ],
    options,
  );
}

describe("createPost — publish now", () => {
  test("writes one post, one media row and one pending target per platform", async () => {
    const instagram = await createAccount("instagram");
    const facebook = await createAccount("facebook");

    const { postId, status } = await createPost({
      userId: USER_ID,
      contentText: "Promo September",
      timezone: "Asia/Jakarta",
      scheduledAt: null,
      media: TEST_MEDIA,
      targets: [
        { platform: "instagram", socialAccountId: instagram },
        { platform: "facebook", socialAccountId: facebook },
      ],
    });

    assert.equal(status, "processing");

    const post = await getPostRow(postId);
    assert.ok(post);
    assert.equal(post.contentText, "Promo September");
    assert.equal(post.userId, USER_ID);
    assert.equal(post.status, "processing");
    assert.equal(post.scheduledAt, null);

    const media = await mediaRowsFor(postId);
    assert.equal(media.length, 1);
    assert.equal(media[0].storageKey, TEST_MEDIA.storageKey);
    assert.equal(media[0].mimeType, "image/jpeg");
    assert.equal(media[0].width, 1080);
    assert.equal(media[0].height, 1080);

    const targets = await targetRowsFor(postId);
    assert.equal(targets.length, 2);
    assert.deepEqual(
      targets.map((row) => row.platform).sort(),
      ["facebook", "instagram"],
    );
    for (const target of targets) {
      assert.equal(target.status, "pending");
      assert.equal(target.maxAttempts, 3);
      assert.equal(target.attemptCount, 0);
    }
  });

  test("enqueues one immediate job per target", async () => {
    const instagram = await createAccount("instagram");
    const tiktok = await createAccount("tiktok");

    const { postId } = await createPost({
      userId: USER_ID,
      contentText: "Publish now",
      timezone: "UTC",
      scheduledAt: null,
      media: TEST_MEDIA,
      targets: [
        { platform: "instagram", socialAccountId: instagram },
        { platform: "tiktok", socialAccountId: tiktok },
      ],
    });

    const targets = await targetRowsFor(postId);

    assert.equal(enqueued.length, 2);
    assert.deepEqual(
      enqueued.map((job) => job.postPlatformId).sort(),
      targets.map((row) => row.id).sort(),
    );
    for (const job of enqueued) {
      assert.equal(job.name, "publish");
      assert.equal(job.attempt, 1);
      assert.equal(job.delayMs, 0);
      assert.equal(job.maxAttempts, 3);
    }

    // The job id is written back so a later retry can remove the stale job.
    for (const target of await targetRowsFor(postId)) {
      assert.equal(target.bullmqJobId, `${target.id}:1`);
    }
  });
});

describe("createPost — schedule for later", () => {
  test("stores the IANA timezone and the UTC instant", async () => {
    const instagram = await createAccount("instagram");
    const scheduledAt = inTheFuture();

    const { postId, status } = await createPost({
      userId: USER_ID,
      contentText: "Scheduled promo",
      timezone: "Asia/Jakarta",
      scheduledAt,
      media: TEST_MEDIA,
      targets: [{ platform: "instagram", socialAccountId: instagram }],
    });

    assert.equal(status, "scheduled");

    const post = await getPostRow(postId);
    assert.ok(post);
    assert.equal(post.status, "scheduled");
    assert.equal(post.timezone, "Asia/Jakarta");
    assert.ok(post.scheduledAt);
    assert.equal(post.scheduledAt.getTime(), scheduledAt.getTime());
    assert.equal(post.publishedAt, null);
  });

  test("enqueues delayed jobs that land on the scheduled instant", async () => {
    const facebook = await createAccount("facebook");
    const scheduledAt = inTheFuture(90 * 60_000);

    const { postId } = await createPost({
      userId: USER_ID,
      contentText: "Later",
      timezone: "America/New_York",
      scheduledAt,
      media: TEST_MEDIA,
      targets: [{ platform: "facebook", socialAccountId: facebook }],
    });

    const [target] = await targetRowsFor(postId);
    assert.ok(target);

    const jobs = jobsFor(target.id);
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0].delayMs !== null && jobs[0].delayMs > 0);
    assert.equal(jobs[0].attempt, 1);
    assert.equal(jobs[0].maxAttempts, 3);

    // The delay is the distance to the scheduled instant (~2s of slack for the
    // clock ticking between `createPost` and this assertion).
    const expected = scheduledAt.getTime() - Date.now();
    assert.ok(
      Math.abs((jobs[0].delayMs ?? 0) - expected) <= 2_000,
      `delay ${jobs[0].delayMs} should be within 2s of ${expected}`,
    );
  });
});

describe("createPost — server-side validation", () => {
  test("rejects an empty target list", async () => {
    await assert.rejects(
      () =>
        createPost({
          userId: USER_ID,
          contentText: "No platforms",
          timezone: "UTC",
          scheduledAt: null,
          media: TEST_MEDIA,
          targets: [],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message === "Select at least one platform.",
    );

    assert.equal(await postCount(), 0);
  });

  test("rejects two targets for the same platform", async () => {
    const first = await createAccount("instagram", { platformAccountId: "ig-1" });
    const second = await createAccount("instagram", { platformAccountId: "ig-2" });

    await assert.rejects(
      () =>
        createPost({
          userId: USER_ID,
          contentText: "Twice the same platform",
          timezone: "UTC",
          scheduledAt: null,
          media: TEST_MEDIA,
          targets: [
            { platform: "instagram", socialAccountId: first },
            { platform: "instagram", socialAccountId: second },
          ],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message === "Choose one account per platform.",
    );

    assert.equal(await postCount(), 0);
    assert.equal(enqueued.length, 0);
  });

  test("rejects an account that belongs to another user", async () => {
    const foreign = await createAccount("instagram", { userId: OTHER_USER_ID });

    await assert.rejects(
      () =>
        createPost({
          userId: USER_ID,
          contentText: "Not mine",
          timezone: "UTC",
          scheduledAt: null,
          media: TEST_MEDIA,
          targets: [{ platform: "instagram", socialAccountId: foreign }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "forbidden" &&
        error.message === "We couldn't find that account. Reconnect it and try again.",
    );

    assert.equal(await postCount(), 0);
  });

  test("rejects an account that needs reconnection", async () => {
    const stale = await createAccount("instagram", { status: "needs_reconnect" });

    await assert.rejects(
      () =>
        createPost({
          userId: USER_ID,
          contentText: "Broken account",
          timezone: "UTC",
          scheduledAt: null,
          media: TEST_MEDIA,
          targets: [{ platform: "instagram", socialAccountId: stale }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message ===
          "Instagram needs reconnection. Reconnect the account, then retry.",
    );

    assert.equal(await postCount(), 0);
  });

  test("rejects a disconnected account", async () => {
    const gone = await createAccount("tiktok", { status: "disconnected" });

    await assert.rejects(
      () =>
        createPost({
          userId: USER_ID,
          contentText: "Disconnected account",
          timezone: "UTC",
          scheduledAt: null,
          media: TEST_MEDIA,
          targets: [{ platform: "tiktok", socialAccountId: gone }],
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message ===
          "TikTok needs reconnection. Reconnect the account, then retry.",
    );

    assert.equal(await postCount(), 0);
  });
});

describe("retryPlatform — only the failed platform is retried", () => {
  test("retries a failed target and enqueues exactly one job for it", async () => {
    const { postId, targetId } = await buildPartialFailurePost();

    const instagram = targetId("instagram");
    await setTargetAttempts(instagram, 2);
    await setTargetError(instagram, "provider_error");
    await setTargetLock(instagram, "worker-1");

    await retryPlatform(USER_ID, instagram);

    // Exactly one job: Facebook and TikTok already succeeded and are untouched.
    assert.deepEqual(
      enqueued.map((job) => job.postPlatformId),
      [instagram],
    );
    assert.equal(enqueued[0].attempt, 3);
    assert.equal(jobsFor(targetId("facebook")).length, 0);
    assert.equal(jobsFor(targetId("tiktok")).length, 0);

    const retried = await getTargetRow(instagram);
    assert.ok(retried);
    assert.equal(retried.status, "pending");
    assert.equal(retried.attemptCount, 3);
    assert.equal(retried.lastErrorCode, null);
    assert.equal(retried.lastErrorMessage, null);
    assert.equal(retried.lockedAt, null);
    assert.equal(retried.lockedBy, null);

    const post = await getPostRow(postId);
    assert.equal(post?.status, "processing");
  });

  test("refuses to retry a platform that already succeeded", async () => {
    const { targetId } = await buildPartialFailurePost();

    const facebook = targetId("facebook");
    const before = await getTargetRow(facebook);

    await assert.rejects(
      () => retryPlatform(USER_ID, facebook),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message ===
          "This platform is already being retried or has succeeded.",
    );

    assert.equal(enqueued.length, 0);
    assert.deepEqual(await getTargetRow(facebook), before);
  });

  test("refuses to retry a platform that is already pending", async () => {
    const { targetId } = await buildPost([
      { platform: "instagram", status: "pending" },
    ]);

    await assert.rejects(
      () => retryPlatform(USER_ID, targetId("instagram")),
      (error: unknown) =>
        error instanceof AppError &&
        error.message ===
          "This platform is already being retried or has succeeded.",
    );

    assert.equal(enqueued.length, 0);
  });
});

describe("retryPlatform — when retrying must not be offered", () => {
  test("refuses to retry an auth failure and asks for a reconnect", async () => {
    const { targetId } = await buildPartialFailurePost();

    const instagram = targetId("instagram");
    await setTargetError(instagram, "token_expired");

    await assert.rejects(
      () => retryPlatform(USER_ID, instagram),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        /reconnect/i.test(error.message),
    );

    const target = await getTargetRow(instagram);
    assert.equal(target?.status, "failed");
    assert.equal(target?.lastErrorCode, "token_expired");
    assert.equal(enqueued.length, 0);
  });

  test("refuses to retry a target on a cancelled post", async () => {
    const { postId, targetId } = await buildPartialFailurePost({
      postStatus: "cancelled",
    });

    const instagram = targetId("instagram");
    await setTargetError(instagram, "network_error");

    await assert.rejects(
      () => retryPlatform(USER_ID, instagram),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message === "This post was cancelled and can't be retried.",
    );

    const target = await getTargetRow(instagram);
    assert.equal(target?.status, "failed");
    assert.equal((await getPostRow(postId))?.status, "cancelled");
    assert.equal(enqueued.length, 0);
  });

  test("refuses to retry a target whose account was disconnected", async () => {
    const { targetId } = await buildPartialFailurePost();

    const instagram = targetId("instagram");
    await setTargetError(instagram, "network_error");

    const target = await getTargetRow(instagram);
    assert.ok(target);
    await disconnectAccount(USER_ID, target.socialAccountId);

    await assert.rejects(
      () => retryPlatform(USER_ID, instagram),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "validation_failed" &&
        error.message === "This Instagram account is no longer connected.",
    );

    assert.equal(enqueued.length, 0);
  });
});

describe("retryPlatform — stale job handling", () => {
  test("removes the previous job before enqueuing the retry", async () => {
    const { targetId } = await buildPartialFailurePost();

    const instagram = targetId("instagram");
    await setTargetAttempts(instagram, 1);
    await setTargetJobId(instagram, "stale-job");

    await retryPlatform(USER_ID, instagram);

    assert.deepEqual(removed, ["stale-job"]);
    assert.equal(enqueued.length, 1);
    assert.equal(enqueued[0].postPlatformId, instagram);
    assert.equal(enqueued[0].attempt, 2);

    const target = await getTargetRow(instagram);
    assert.equal(target?.bullmqJobId, `${instagram}:2`);
  });
});

describe("recomputePostStatus", () => {
  test("all targets succeeded -> published", async () => {
    const { postId } = await buildPost([
      { platform: "instagram", status: "success" },
      { platform: "facebook", status: "success" },
    ]);

    assert.equal(await recomputePostStatus(postId, { scheduled: false }), "published");

    const post = await getPostRow(postId);
    assert.equal(post?.status, "published");
    assert.ok(post?.publishedAt instanceof Date);
  });

  test("some targets failed -> partial_failure", async () => {
    const { postId } = await buildPost([
      { platform: "instagram", status: "failed" },
      { platform: "facebook", status: "success" },
      { platform: "tiktok", status: "success" },
    ]);

    assert.equal(
      await recomputePostStatus(postId, { scheduled: false }),
      "partial_failure",
    );
    assert.equal((await getPostRow(postId))?.status, "partial_failure");
  });

  test("every target failed -> failed", async () => {
    const { postId } = await buildPost([
      { platform: "instagram", status: "failed" },
      { platform: "tiktok", status: "failed" },
    ]);

    assert.equal(await recomputePostStatus(postId, { scheduled: false }), "failed");
    assert.equal((await getPostRow(postId))?.status, "failed");
  });

  test("any target still processing -> processing", async () => {
    const { postId } = await buildPost([
      { platform: "instagram", status: "success" },
      { platform: "facebook", status: "processing" },
      { platform: "tiktok", status: "pending" },
    ]);

    assert.equal(
      await recomputePostStatus(postId, { scheduled: false }),
      "processing",
    );
    assert.equal((await getPostRow(postId))?.status, "processing");
  });

  test("all targets still waiting for their slot -> scheduled", async () => {
    const { postId } = await buildPost(
      [
        { platform: "instagram", status: "pending" },
        { platform: "facebook", status: "pending" },
      ],
      { postStatus: "scheduled", scheduledAt: inTheFuture() },
    );

    assert.equal(await recomputePostStatus(postId, { scheduled: true }), "scheduled");
    assert.equal((await getPostRow(postId))?.status, "scheduled");
  });

  test("pending targets on a post that is past its slot -> processing", async () => {
    const { postId } = await buildPost(
      [{ platform: "instagram", status: "pending" }],
      { postStatus: "scheduled", scheduledAt: inTheFuture() },
    );

    assert.equal(
      await recomputePostStatus(postId, { scheduled: false }),
      "processing",
    );
    assert.equal((await getPostRow(postId))?.status, "processing");
  });
});

describe("ownership — a second user sees and changes nothing", () => {
  test("getPostSummary and getPostDetail return null", async () => {
    const { postId } = await buildPost([
      { platform: "instagram", status: "failed" },
    ]);

    assert.equal(await getPostSummary(OTHER_USER_ID, postId), null);
    assert.equal(await getPostDetail(OTHER_USER_ID, postId), null);

    const mine = await getPostSummary(USER_ID, postId);
    assert.equal(mine?.id, postId);
    assert.equal(mine?.platforms.length, 1);
  });

  test("listScheduledPosts only returns the owner's scheduled posts", async () => {
    await insertPost({
      status: "scheduled",
      scheduledAt: inTheFuture(),
      caption: "Mine",
    });

    assert.deepEqual(await listScheduledPosts(OTHER_USER_ID), []);
    assert.equal((await listScheduledPosts(USER_ID)).length, 1);
  });

  test("listHistoryPosts only returns the owner's posts", async () => {
    await insertPost({ status: "processing", caption: "Mine" });

    assert.deepEqual(await listHistoryPosts(OTHER_USER_ID), []);
    assert.equal((await listHistoryPosts(USER_ID)).length, 1);
  });

  test("retryPlatform rejects a target that is not the caller's", async () => {
    const { targetId } = await buildPartialFailurePost();

    const instagram = targetId("instagram");
    const before = await getTargetRow(instagram);

    await assert.rejects(
      () => retryPlatform(OTHER_USER_ID, instagram),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "not_found" &&
        error.message === "We couldn't find that post.",
    );

    assert.deepEqual(await getTargetRow(instagram), before);
    assert.equal(enqueued.length, 0);
  });

  test("disconnectAccount rejects an account that is not the caller's", async () => {
    const account = await createAccount("instagram");

    // Like every other domain entry point this must be an AppError, so the UI
    // can show the sentence instead of falling back to a generic one.
    await assert.rejects(
      () => disconnectAccount(OTHER_USER_ID, account),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "not_found" &&
        error.message === "We couldn't find that account.",
    );

    assert.equal((await getAccountRow(account))?.status, "active");
  });
});

describe("disconnectAccount", () => {
  test("fails every pending target and recomputes their posts", async () => {
    const account = await createAccount("instagram");

    const firstPost = await insertPost({ status: "processing", caption: "First" });
    const firstTarget = await insertTarget(firstPost, account, "instagram", {
      status: "pending",
    });
    await setTargetJobId(firstTarget, "first-job");

    const secondPost = await insertPost({ status: "scheduled", caption: "Second", scheduledAt: inTheFuture() });
    const secondTarget = await insertTarget(secondPost, account, "instagram", {
      status: "pending",
    });
    await setTargetJobId(secondTarget, "second-job");

    await disconnectAccount(USER_ID, account);

    const accountRow = await getAccountRow(account);
    assert.equal(accountRow?.status, "disconnected");
    assert.equal(accountRow?.encryptedAccessToken, "");
    assert.equal(accountRow?.encryptedRefreshToken, null);
    assert.equal(accountRow?.tokenExpiresAt, null);

    for (const targetId of [firstTarget, secondTarget]) {
      const target = await getTargetRow(targetId);
      assert.equal(target?.status, "failed");
      assert.equal(target?.lastErrorCode, "account_disconnected");
      assert.equal(
        target?.lastErrorMessage,
        "This Instagram account is no longer connected.",
      );
      assert.equal(target?.bullmqJobId, null);
    }

    assert.deepEqual(removed.sort(), ["first-job", "second-job"]);
    assert.equal((await getPostRow(firstPost))?.status, "failed");
    assert.equal((await getPostRow(secondPost))?.status, "failed");
  });

  test("leaves targets that already succeeded untouched", async () => {
    const account = await createAccount("instagram");

    const pendingPost = await insertPost({ status: "processing", caption: "Waiting" });
    await insertTarget(pendingPost, account, "instagram", { status: "pending" });

    const donePost = await insertPost({ status: "published", caption: "Done" });
    const doneTarget = await insertTarget(donePost, account, "instagram", {
      status: "success",
    });
    const before = await getTargetRow(doneTarget);

    await disconnectAccount(USER_ID, account);

    assert.deepEqual(await getTargetRow(doneTarget), before);
    assert.equal((await getTargetRow(doneTarget))?.status, "success");
    assert.equal((await getPostRow(donePost))?.status, "published");
    assert.equal((await getPostRow(pendingPost))?.status, "failed");
  });
});

describe("listAccountSummaries", () => {
  test("returns one entry per platform in a fixed order", async () => {
    const summaries = await listAccountSummaries(USER_ID);

    assert.equal(summaries.length, 3);
    assert.deepEqual(
      summaries.map((entry) => entry.platform),
      ["instagram", "facebook", "tiktok"],
    );
    for (const entry of summaries) {
      assert.equal(entry.id, null);
      assert.equal(entry.status, "disconnected");
      assert.equal(entry.username, null);
      assert.equal(entry.accountLabel, null);
    }
  });

  test("fills in the connected account and leaves the rest disconnected", async () => {
    const account = await createAccount("instagram", { username: "ig_user" });

    const summaries = await listAccountSummaries(USER_ID);
    const instagram = rowFor(summaries, "instagram");

    assert.equal(instagram.id, account);
    assert.equal(instagram.status, "active");
    assert.equal(instagram.username, "ig_user");
    assert.equal(instagram.accountLabel, "@ig_user");
    assert.equal(rowFor(summaries, "facebook").status, "disconnected");
    assert.equal(rowFor(summaries, "tiktok").status, "disconnected");
  });

  test("treats a disconnected account row as not connected", async () => {
    await createAccount("tiktok", { status: "disconnected" });

    const summaries = await listAccountSummaries(USER_ID);
    const tiktok = rowFor(summaries, "tiktok");

    assert.equal(tiktok.id, null);
    assert.equal(tiktok.status, "disconnected");
    assert.equal(tiktok.username, null);
  });
});

describe("saveConnectedAccounts", () => {
  test("stores one encrypted account per platform", async () => {
    const saved = await saveConnectedAccounts(USER_ID, [
      {
        platform: "instagram",
        platformAccountId: "ig-1",
        username: "ig_user",
        accessToken: "ig-access",
        refreshToken: "ig-refresh",
      },
      {
        platform: "tiktok",
        platformAccountId: "tt-1",
        username: "tt_user",
        accessToken: "tt-access",
      },
    ]);

    assert.deepEqual(saved, ["instagram", "tiktok"]);

    const rows = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, USER_ID));
    assert.equal(rows.length, 2);

    const instagram = rowFor(rows, "instagram");
    assert.equal(instagram.status, "active");
    assert.notEqual(instagram.encryptedAccessToken, "ig-access");
    assert.equal(decryptSecret(instagram.encryptedAccessToken), "ig-access");
    assert.ok(instagram.encryptedRefreshToken);
    assert.equal(decryptSecret(instagram.encryptedRefreshToken), "ig-refresh");

    const tiktok = rowFor(rows, "tiktok");
    assert.equal(decryptSecret(tiktok.encryptedAccessToken), "tt-access");
    assert.equal(tiktok.encryptedRefreshToken, null);
  });

  test("re-points an existing account instead of duplicating it", async () => {
    const original = await createAccount("instagram", {
      platformAccountId: "ig-1",
      username: "ig_user",
      status: "needs_reconnect",
    });

    const saved = await saveConnectedAccounts(USER_ID, [
      {
        platform: "instagram",
        platformAccountId: "ig-1",
        username: "ig_renamed",
        accessToken: "ig-access-2",
        refreshToken: "ig-refresh-2",
      },
    ]);

    assert.deepEqual(saved, ["instagram"]);

    const rows = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, USER_ID));
    assert.equal(rows.length, 1);

    const instagram = rowFor(rows, "instagram");
    assert.equal(instagram.id, original);
    assert.equal(instagram.username, "ig_renamed");
    // Reconnecting resets the account back to active.
    assert.equal(instagram.status, "active");
    assert.equal(instagram.lastErrorCode, null);
    assert.equal(decryptSecret(instagram.encryptedAccessToken), "ig-access-2");
  });
});
