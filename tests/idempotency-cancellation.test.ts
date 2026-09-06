import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { postPlatforms } from "@/lib/db/schema";
import {
  cancelScheduledPost,
  createPost,
  findDuePendingPlatforms,
  recomputePostStatus,
} from "@/lib/domain/posts";
import {
  claimPlatformForPublish,
  findStalledPlatformIds,
  releaseClaim,
  STALE_LOCK_MINUTES,
  type ClaimOutcome,
  type PublishContext,
} from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { executePublishJob } from "@/lib/publishing/execute";

import { seedUser } from "./db-harness";
import {
  createAccount,
  getPostRow,
  getTargetRow,
  insertPost,
  insertTarget,
  OTHER_USER_ID,
  setupTestDatabase,
  TEST_MEDIA,
  USER_ID,
} from "./fixtures";
import { publishCallsFor, setScript } from "./fake-providers";
import { enqueued, removed } from "./fake-queue";

const WORKER_A = "worker-a";
const WORKER_B = "worker-b";

beforeEach(async () => {
  await setupTestDatabase();
});

function assertClaimed(outcome: ClaimOutcome): PublishContext {
  if (!outcome.claimed) {
    assert.fail(`expected the claim to succeed, got "${outcome.reason}"`);
  }
  return outcome.context;
}

function assertRefused(outcome: ClaimOutcome, expectedReason: string): void {
  assert.equal(outcome.claimed, false);
  if (outcome.claimed) return;
  assert.equal(outcome.reason, expectedReason);
}

/** A `processing` row whose lock is this old simulates a crashed worker. */
function minutesAgo(minutes: number, seconds = 0): Date {
  return new Date(Date.now() - (minutes * 60_000 + seconds * 1_000));
}

async function setLockAge(postPlatformId: string, lockedAt: Date): Promise<void> {
  await db
    .update(postPlatforms)
    .set({ lockedAt })
    .where(eq(postPlatforms.id, postPlatformId));
}

async function newTarget(platform: "instagram" | "facebook" = "instagram") {
  const accountId = await createAccount(platform);
  const postId = await insertPost({ status: "processing" });
  const postPlatformId = await insertTarget(postId, accountId, platform);
  return { accountId, postId, postPlatformId };
}

describe("duplicate-execution prevention (Plan section 23)", () => {
  test("only one worker can claim a target", async () => {
    const { postPlatformId } = await newTarget();

    const first = await claimPlatformForPublish(postPlatformId, WORKER_A);
    assert.equal(first.claimed, true);

    const second = await claimPlatformForPublish(postPlatformId, WORKER_B);
    assertRefused(second, "already-claimed-or-terminal");

    const row = await getTargetRow(postPlatformId);
    assert.equal(row?.status, "processing");
    assert.equal(row?.lockedBy, WORKER_A);
  });

  test("concurrent claims: exactly one worker wins the target", async () => {
    const { postPlatformId } = await newTarget();

    const results = await Promise.allSettled([
      claimPlatformForPublish(postPlatformId, WORKER_A),
      claimPlatformForPublish(postPlatformId, WORKER_B),
    ]);

    const winners = results.filter(
      (result) => result.status === "fulfilled" && result.value.claimed,
    );

    assert.equal(results.length, 2);
    assert.equal(
      winners.length,
      1,
      "two workers must never both publish the same target",
    );

    for (const result of results) {
      if (result.status === "fulfilled" && !result.value.claimed) {
        assert.equal(result.value.reason, "already-claimed-or-terminal");
      }
    }

    const row = await getTargetRow(postPlatformId);
    assert.equal(row?.status, "processing");
    assert.ok(row?.lockedBy === WORKER_A || row?.lockedBy === WORKER_B);
  });

  test("a second executePublishJob for the same target never publishes twice", async () => {
    const { postPlatformId } = await newTarget();
    setScript("instagram", { kind: "published", externalPostId: "ig-1" });

    const first = await executePublishJob({
      postPlatformId,
      attempt: 1,
      workerId: WORKER_A,
      bullmqJobId: "job-1",
    });

    const second = await executePublishJob({
      postPlatformId,
      attempt: 1,
      workerId: WORKER_B,
      bullmqJobId: "job-1",
    });

    assert.equal(first.status, "published");
    assert.equal(second.status, "skipped");
    assert.equal(publishCallsFor("instagram").length, 1);
    assert.equal((await getTargetRow(postPlatformId))?.status, "success");
  });

  test("releaseClaim clears the lock without changing the status", async () => {
    const { postPlatformId } = await newTarget();

    assertClaimed(await claimPlatformForPublish(postPlatformId, WORKER_A));
    await releaseClaim(postPlatformId);

    const row = await getTargetRow(postPlatformId);
    assert.equal(row?.status, "processing");
    assert.equal(row?.lockedAt, null);
    assert.equal(row?.lockedBy, null);
  });
});

describe("stalled worker recovery (Plan section 26)", () => {
  test("a lock older than the stale window is reclaimable", async () => {
    const { postPlatformId } = await newTarget();

    assertClaimed(await claimPlatformForPublish(postPlatformId, WORKER_A));
    await setLockAge(postPlatformId, minutesAgo(STALE_LOCK_MINUTES, 60));

    assert.ok(
      (await findStalledPlatformIds()).includes(postPlatformId),
      "a crashed worker's target must be visible to the recovery sweep",
    );

    const context = assertClaimed(
      await claimPlatformForPublish(postPlatformId, WORKER_B),
    );
    assert.equal(context.postPlatform.lockedBy, WORKER_B);
  });

  test("a lock just inside the stale window is not reclaimable", async () => {
    const { postPlatformId } = await newTarget();

    assertClaimed(await claimPlatformForPublish(postPlatformId, WORKER_A));
    await setLockAge(postPlatformId, minutesAgo(STALE_LOCK_MINUTES, -60));

    assert.ok(!(await findStalledPlatformIds()).includes(postPlatformId));

    assertRefused(
      await claimPlatformForPublish(postPlatformId, WORKER_B),
      "already-claimed-or-terminal",
    );
    assert.equal((await getTargetRow(postPlatformId))?.lockedBy, WORKER_A);
  });

  test("a fresh lock (30 seconds old) is not reclaimable", async () => {
    const { postPlatformId } = await newTarget();

    assertClaimed(await claimPlatformForPublish(postPlatformId, WORKER_A));
    await setLockAge(postPlatformId, new Date(Date.now() - 30_000));

    assert.ok(!(await findStalledPlatformIds()).includes(postPlatformId));

    assertRefused(
      await claimPlatformForPublish(postPlatformId, WORKER_B),
      "already-claimed-or-terminal",
    );
    assert.equal((await getTargetRow(postPlatformId))?.lockedBy, WORKER_A);
  });

  test("the recovery sweep finds due scheduled targets only", async () => {
    const accountId = await createAccount("instagram");

    const duePostId = await insertPost({
      status: "scheduled",
      scheduledAt: new Date(Date.now() - 60_000),
    });
    const dueTargetId = await insertTarget(duePostId, accountId, "instagram");

    const futurePostId = await insertPost({
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 60 * 60_000),
    });
    const futureTargetId = await insertTarget(
      futurePostId,
      accountId,
      "instagram",
    );

    const due = await findDuePendingPlatforms();
    const ids = due.map((row) => row.id);

    assert.ok(ids.includes(dueTargetId), "an overdue scheduled post must be swept");
    assert.ok(!ids.includes(futureTargetId), "a future post must not be swept");
  });
});

describe("cancel scheduled post (Plan section 28)", () => {
  const scheduledAt = () => new Date(Date.now() + 30 * 60_000);

  async function newScheduledPost() {
    const instagram = await createAccount("instagram");
    const facebook = await createAccount("facebook");

    const { postId, status } = await createPost({
      userId: USER_ID,
      contentText: "Scheduled promo",
      timezone: "Asia/Jakarta",
      scheduledAt: scheduledAt(),
      media: TEST_MEDIA,
      targets: [
        { platform: "instagram", socialAccountId: instagram },
        { platform: "facebook", socialAccountId: facebook },
      ],
    });

    return { postId, status };
  }

  test("a scheduled post enqueues delayed jobs", async () => {
    const { postId, status } = await newScheduledPost();

    assert.equal(status, "scheduled");
    assert.equal((await getPostRow(postId))?.status, "scheduled");
    assert.equal(enqueued.length, 2);

    for (const job of enqueued) {
      assert.ok(
        job.delayMs !== null && job.delayMs > 0,
        "a scheduled job must be delayed until its scheduled time",
      );
    }
  });

  test("cancel marks the post and every target cancelled and removes the jobs", async () => {
    const { postId } = await newScheduledPost();
    const targetIds = enqueued.map((job) => job.postPlatformId);

    await cancelScheduledPost(USER_ID, postId);

    const post = await getPostRow(postId);
    assert.equal(post?.status, "cancelled");
    assert.ok(post?.cancelledAt instanceof Date);

    for (const targetId of targetIds) {
      const row = await getTargetRow(targetId);
      assert.equal(row?.status, "failed");
      assert.equal(row?.lastErrorCode, "cancelled");
    }

    const jobIds = enqueued.map((job) => job.id);
    assert.deepEqual([...removed].sort(), [...jobIds].sort());
  });

  test("cancel clears the queued job id", async () => {
    const { postId } = await newScheduledPost();
    const targetIds = enqueued.map((job) => job.postPlatformId);

    for (const targetId of targetIds) {
      assert.equal(typeof (await getTargetRow(targetId))?.bullmqJobId, "string");
    }

    await cancelScheduledPost(USER_ID, postId);

    for (const targetId of targetIds) {
      assert.equal((await getTargetRow(targetId))?.bullmqJobId, null);
    }
  });

  test("a cancelled post is never published (target still claimable)", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({
      status: "cancelled",
      scheduledAt: scheduledAt(),
    });
    const postPlatformId = await insertTarget(postId, accountId, "instagram");

    const outcome = await executePublishJob({
      postPlatformId,
      attempt: 1,
      workerId: WORKER_A,
      bullmqJobId: "job-1",
    });

    assert.deepEqual(outcome, {
      status: "skipped",
      reason: "post-cancelled",
    });
    assert.equal(publishCallsFor("instagram").length, 0);

    const row = await getTargetRow(postPlatformId);
    assert.equal(row?.status, "failed");
    assert.equal(row?.lastErrorCode, "cancelled");
  });

  test("a post cancelled while queued is never published", async () => {
    const { postId } = await newScheduledPost();
    await cancelScheduledPost(USER_ID, postId);

    const outcome = await executePublishJob({
      postPlatformId: enqueued[0].postPlatformId,
      attempt: 1,
      workerId: WORKER_A,
      bullmqJobId: enqueued[0].id,
    });

    // cancelScheduledPost has already moved the target to `failed`, so the
    // claim is refused as terminal ("already-claimed-or-terminal") instead of
    // reaching the `post-cancelled` branch; either way the provider is never
    // called. See the test above for the `post-cancelled` path itself.
    assert.deepEqual(outcome, {
      status: "skipped",
      reason: "already-claimed-or-terminal",
    });
    assert.equal(publishCallsFor().length, 0);
  });

  test("a cancelled post is not picked up by the recovery sweep", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({
      status: "scheduled",
      scheduledAt: new Date(Date.now() - 60_000),
    });
    const postPlatformId = await insertTarget(postId, accountId, "instagram");

    await cancelScheduledPost(USER_ID, postId);

    const due = await findDuePendingPlatforms();
    assert.ok(!due.some((row) => row.id === postPlatformId));
  });

  test("cancelling a post that is no longer scheduled is rejected", async () => {
    for (const status of ["published", "processing"] as const) {
      const postId = await insertPost({ status });

      await assert.rejects(
        () => cancelScheduledPost(USER_ID, postId),
        (error: unknown) =>
          error instanceof AppError && error.code === "validation_failed",
        `cancelling a ${status} post must be rejected`,
      );

      assert.equal((await getPostRow(postId))?.status, status);
    }
  });
});

describe("ownership", () => {
  async function otherUsersScheduledPost() {
    await seedUser(OTHER_USER_ID);
    const accountId = await createAccount("instagram", {
      userId: OTHER_USER_ID,
    });
    const postId = await insertPost({
      userId: OTHER_USER_ID,
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 60 * 60_000),
    });
    const postPlatformId = await insertTarget(postId, accountId, "instagram");
    return { postId, postPlatformId };
  }

  test("cancelScheduledPost rejects a post owned by another user", async () => {
    const { postId, postPlatformId } = await otherUsersScheduledPost();

    await assert.rejects(
      () => cancelScheduledPost(USER_ID, postId),
      (error: unknown) =>
        error instanceof AppError && error.code === "not_found",
    );

    assert.equal((await getPostRow(postId))?.status, "scheduled");
    assert.equal((await getTargetRow(postPlatformId))?.status, "pending");
  });

  test("claiming one target never touches another user's rows", async () => {
    const other = await otherUsersScheduledPost();
    const mine = await newTarget();

    assertClaimed(await claimPlatformForPublish(mine.postPlatformId, WORKER_A));

    // claimPlatformForPublish is worker-scoped (target id + worker id), so
    // ownership is enforced by the user-scoped domain calls above; what must
    // never happen is one claim spilling into another user's rows.
    assert.equal((await getTargetRow(other.postPlatformId))?.status, "pending");
    assert.equal((await getTargetRow(other.postPlatformId))?.lockedBy, null);
    assert.equal((await getPostRow(other.postId))?.status, "scheduled");
  });
});

describe("recomputePostStatus", () => {
  test("writes the status derived from the platform targets", async () => {
    const instagram = await createAccount("instagram");
    const facebook = await createAccount("facebook");
    const postId = await insertPost({ status: "processing" });
    const instagramTarget = await insertTarget(postId, instagram, "instagram");
    const facebookTarget = await insertTarget(postId, facebook, "facebook");

    await db
      .update(postPlatforms)
      .set({ status: "success" })
      .where(eq(postPlatforms.id, instagramTarget));
    await db
      .update(postPlatforms)
      .set({ status: "failed" })
      .where(eq(postPlatforms.id, facebookTarget));

    const next = await recomputePostStatus(postId, { scheduled: false });

    assert.equal(next, "partial_failure");
    assert.equal((await getPostRow(postId))?.status, "partial_failure");
  });
});
