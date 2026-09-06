import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { eq } from "drizzle-orm";

import { decryptSecret } from "@/lib/crypto/tokens";
import { postPlatforms, posts, socialAccounts } from "@/lib/db/schema";
import {
  MAX_ATTEMPTS,
  STALE_LOCK_MINUTES,
  backoffDelayMs,
  claimPlatformForPublish,
  finishExecutionAccepted,
  releaseClaim,
  startExecution,
} from "@/lib/domain/executions";
import { createPost, recomputePostStatus } from "@/lib/domain/posts";
import { ProviderError } from "@/lib/errors";
import { executePublishJob, readResumeHandle } from "@/lib/publishing/execute";
import type { Platform } from "@/lib/status";

import { getDb } from "./db-harness";
import {
  createAccount,
  getAccountRow,
  getPostRow,
  getTargetRow,
  insertPost,
  insertTarget,
  listExecutionRows,
  setupTestDatabase,
  TEST_MEDIA,
  USER_ID,
} from "./fixtures";
import {
  publishCallsFor,
  setScript,
  setScripts,
  statusCallsFor,
} from "./fake-providers";
import { enqueued, jobsFor } from "./fake-queue";

/**
 * Worker execution, retry policy and failure isolation — Plan sections
 * 18-28 (execution model, retries, isolation, async status, cancellation),
 * 38 (observability) and 42 (integration tests).
 *
 * The database is a real Postgres (PGlite) and the providers/queue are fakes
 * swapped in by `tests/register.ts`, so nothing here touches Redis or a social
 * API.
 */

const WORKER = "publish-worker-test";
const PLATFORM_ORDER: readonly Platform[] = ["instagram", "facebook", "tiktok"];

beforeEach(async () => {
  await setupTestDatabase();
});

async function runJob(postPlatformId: string, attempt = 1) {
  return executePublishJob({
    postPlatformId,
    attempt,
    workerId: WORKER,
    bullmqJobId: `${postPlatformId}:${attempt}`,
  });
}

/** A terminal post can never be published, so the row is cancelled out of band. */
async function markPostCancelled(postId: string): Promise<void> {
  await getDb()
    .update(posts)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(posts.id, postId));
}

async function expireAccountToken(accountId: string): Promise<void> {
  await getDb()
    .update(socialAccounts)
    .set({ tokenExpiresAt: new Date(Date.now() - 60_000) })
    .where(eq(socialAccounts.id, accountId));
}

/** Simulates BullMQ redelivering a job whose worker died before completing it. */
async function requeueTarget(postPlatformId: string): Promise<void> {
  await getDb()
    .update(postPlatforms)
    .set({ status: "pending", lockedAt: null, lockedBy: null, nextRetryAt: null })
    .where(eq(postPlatforms.id, postPlatformId));
}

async function markTarget(
  postPlatformId: string,
  status: "pending" | "processing" | "success" | "failed",
): Promise<void> {
  await getDb()
    .update(postPlatforms)
    .set({ status })
    .where(eq(postPlatforms.id, postPlatformId));
}

async function createThreeAccounts(): Promise<Record<Platform, string>> {
  return {
    instagram: await createAccount("instagram"),
    facebook: await createAccount("facebook"),
    tiktok: await createAccount("tiktok"),
  };
}

/** The worker rethrows a retryable `ProviderError`: BullMQ owns the retry. */
function retryableErrorWith(code: string) {
  return (error: unknown): boolean => {
    assert.ok(
      error instanceof ProviderError,
      `expected a ProviderError, got ${String(error)}`,
    );
    assert.equal(error.code, code);
    assert.equal(error.retryable, true);
    return true;
  };
}

describe("worker execution (Plan 18, 19, 22, 38)", () => {
  test("a successful publish records one execution and clears the lock", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "instagram");

    setScript("instagram", { kind: "published", externalPostId: "ig-1" });

    const outcome = await runJob(targetId);

    assert.equal(outcome.status, "published");
    if (outcome.status !== "published") assert.fail("expected a published outcome");
    assert.equal(outcome.externalPostId, "ig-1");

    const target = await getTargetRow(targetId);
    assert.equal(target?.status, "success");
    assert.equal(target?.externalPostId, "ig-1");
    assert.ok(target?.publishedAt instanceof Date);
    assert.equal(target?.lockedAt, null);
    assert.equal(target?.lockedBy, null);
    assert.equal(target?.lastErrorCode, null);
    assert.equal(target?.lastErrorMessage, null);
    assert.equal(target?.nextRetryAt, null);
    assert.equal(target?.attemptCount, 1);

    const executions = await listExecutionRows(targetId);
    assert.equal(executions.length, 1);
    assert.equal(executions[0].platform, "instagram");
    assert.equal(executions[0].status, "published");
    assert.equal(executions[0].attemptNumber, 1);
    assert.equal(executions[0].externalPostId, "ig-1");
    assert.equal(executions[0].errorCode, null);
    assert.ok(executions[0].startedAt instanceof Date);
    assert.ok(executions[0].executedAt instanceof Date);

    assert.equal(publishCallsFor("instagram").length, 1);
  });

  test("every platform succeeding publishes the post", async () => {
    const accounts = await createThreeAccounts();

    const { postId } = await createPost({
      userId: USER_ID,
      contentText: "Launch day",
      timezone: "Asia/Jakarta",
      scheduledAt: null,
      media: TEST_MEDIA,
      targets: PLATFORM_ORDER.map((platform) => ({
        platform,
        socialAccountId: accounts[platform],
      })),
    });

    const jobs = [...enqueued];
    assert.equal(jobs.length, 3);

    for (const job of jobs) {
      const outcome = await executePublishJob({
        postPlatformId: job.postPlatformId,
        attempt: job.attempt,
        workerId: WORKER,
        bullmqJobId: job.id,
      });
      assert.equal(outcome.status, "published");
    }

    const post = await getPostRow(postId);
    assert.equal(post?.status, "published");
    assert.ok(post?.publishedAt instanceof Date);

    for (const job of jobs) {
      const target = await getTargetRow(job.postPlatformId);
      assert.equal(target?.status, "success");
      assert.ok(target?.publishedAt instanceof Date);

      const executions = await listExecutionRows(job.postPlatformId);
      assert.equal(executions.length, 1);
      assert.equal(executions[0].status, "published");
      assert.equal(executions[0].attemptNumber, 1);
    }

    assert.equal(publishCallsFor().length, 3);
  });
});

describe("failure isolation (Plan 25, 42)", () => {
  test("one platform failing never disturbs the others", async () => {
    const accounts = await createThreeAccounts();
    const postId = await insertPost({ status: "processing" });

    const targets = {} as Record<Platform, string>;
    for (const platform of PLATFORM_ORDER) {
      targets[platform] = await insertTarget(postId, accounts[platform], platform);
    }

    setScripts({
      // Non-retryable: the row must fail immediately, not be retried.
      instagram: { kind: "error", code: "media_too_large" },
      facebook: { kind: "published", externalPostId: "fb-1" },
      tiktok: { kind: "published", externalPostId: "tt-1" },
    });

    const instagramOutcome = await runJob(targets.instagram);
    assert.equal(instagramOutcome.status, "failed");
    if (instagramOutcome.status !== "failed") {
      assert.fail("expected Instagram to fail terminally");
    }
    assert.equal(instagramOutcome.code, "media_too_large");
    assert.equal(instagramOutcome.postStatus, "processing");

    for (const platform of ["facebook", "tiktok"] as Platform[]) {
      const outcome = await runJob(targets[platform]);
      assert.equal(outcome.status, "published");
    }

    const instagram = await getTargetRow(targets.instagram);
    assert.equal(instagram?.status, "failed");
    assert.equal(instagram?.lastErrorCode, "media_too_large");
    assert.equal(instagram?.externalPostId, null);
    assert.equal(instagram?.publishedAt, null);
    assert.equal(instagram?.nextRetryAt, null);

    for (const platform of ["facebook", "tiktok"] as Platform[]) {
      const row = await getTargetRow(targets[platform]);
      assert.equal(row?.status, "success");
      assert.equal(row?.lastErrorCode, null);
      assert.ok(row?.publishedAt instanceof Date);
    }

    const post = await getPostRow(postId);
    assert.equal(post?.status, "partial_failure");

    // The whole point of isolation: no platform was attempted twice.
    assert.equal(publishCallsFor("instagram").length, 1);
    assert.equal(publishCallsFor("facebook").length, 1);
    assert.equal(publishCallsFor("tiktok").length, 1);
    assert.equal(publishCallsFor().length, 3);
  });
});

describe("retry policy (Plan 24)", () => {
  test("a retryable error releases the row back to pending with a future nextRetryAt", async () => {
    const accountId = await createAccount("tiktok");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "tiktok");

    setScript("tiktok", { kind: "error", code: "rate_limited" });

    // The row is handed back and the error is rethrown for BullMQ.
    await assert.rejects(() => runJob(targetId), retryableErrorWith("rate_limited"));

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "pending");
    assert.equal(row?.attemptCount, 1);
    assert.equal(row?.lockedAt, null);
    assert.equal(row?.lockedBy, null);
    assert.equal(row?.lastErrorCode, "rate_limited");

    const nextRetryAt = row?.nextRetryAt ?? null;
    assert.ok(nextRetryAt, "expected a scheduled retry");
    assert.ok(nextRetryAt.getTime() > Date.now());

    const executions = await listExecutionRows(targetId);
    assert.equal(executions.length, 1);
    assert.equal(executions[0].status, "failed");
    assert.equal(executions[0].attemptNumber, 1);
    assert.equal(executions[0].errorCode, "rate_limited");
    assert.ok(executions[0].executedAt instanceof Date);

    // The worker never self-enqueues: retrying is BullMQ's job, and the
    // recovery sweep is the only thing that re-enqueues.
    assert.equal(jobsFor(targetId).length, 0);
  });

  test("the attempt budget stops after MAX_ATTEMPTS tries", async () => {
    const accountId = await createAccount("tiktok");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "tiktok");

    setScript("tiktok", { kind: "error", code: "rate_limited" });

    assert.equal(MAX_ATTEMPTS, 3);
    const fresh = await getTargetRow(targetId);
    assert.equal(fresh?.maxAttempts, MAX_ATTEMPTS);

    // Attempts 1 and 2 schedule a retry; attempt 3 is the last one.
    for (const attempt of [1, 2]) {
      await assert.rejects(
        () => runJob(targetId, attempt),
        retryableErrorWith("rate_limited"),
      );

      const pending = await getTargetRow(targetId);
      assert.equal(pending?.status, "pending");
      assert.equal(pending?.attemptCount, attempt);
      assert.ok(pending?.nextRetryAt, "expected a scheduled retry");
    }

    const last = await runJob(targetId, 3);
    assert.equal(last.status, "failed");
    if (last.status !== "failed") assert.fail("expected attempt 3 to fail terminally");
    assert.equal(last.code, "rate_limited");
    assert.equal(last.postStatus, "failed");

    const final = await getTargetRow(targetId);
    assert.equal(final?.status, "failed");
    assert.equal(final?.attemptCount, 3);
    assert.equal(final?.lastErrorCode, "rate_limited");
    assert.equal(final?.nextRetryAt, null);
    assert.equal(final?.lockedAt, null);

    const executions = await listExecutionRows(targetId);
    assert.equal(executions.length, 3);
    assert.deepEqual(
      executions.map((row) => row.attemptNumber),
      [1, 2, 3],
    );
    assert.deepEqual(
      executions.map((row) => row.status),
      ["failed", "failed", "failed"],
    );
    assert.equal(publishCallsFor("tiktok").length, 3);
  });

  test("backoffDelayMs grows exponentially and is capped at 30 minutes", () => {
    assert.equal(backoffDelayMs(1), 15_000);
    assert.equal(backoffDelayMs(2), 30_000);
    assert.equal(backoffDelayMs(3), 60_000);
    assert.ok(backoffDelayMs(4) > backoffDelayMs(3));
    assert.equal(backoffDelayMs(50), 30 * 60_000);
    assert.equal(backoffDelayMs(10_000), 30 * 60_000);
  });
});

describe("authentication failures (Plan 8)", () => {
  test("an auth failure fails the target and marks the account needs_reconnect", async () => {
    const accountId = await createAccount("facebook");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "facebook");

    setScript("facebook", { kind: "error", code: "token_expired" });

    // Terminal: no retry, so the call resolves instead of rejecting.
    const outcome = await runJob(targetId);
    assert.equal(outcome.status, "failed");
    if (outcome.status !== "failed") assert.fail("expected a failed outcome");
    assert.equal(outcome.code, "token_expired");
    assert.equal(outcome.postStatus, "failed");

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "failed");
    assert.equal(row?.lastErrorCode, "token_expired");
    assert.equal(row?.nextRetryAt, null);

    const account = await getAccountRow(accountId);
    assert.equal(account?.status, "needs_reconnect");
    assert.equal(account?.lastErrorCode, "token_expired");

    const executions = await listExecutionRows(targetId);
    assert.equal(executions.length, 1);
    assert.equal(executions[0].status, "failed");
    assert.equal(executions[0].errorCode, "token_expired");
  });
});

describe("cancellation (Plan 28)", () => {
  test("a cancelled post is never published", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "instagram");

    setScript("instagram", { kind: "published", externalPostId: "ig-1" });

    // Cancelled after the target was created but before the worker picked it up.
    await markPostCancelled(postId);

    const outcome = await runJob(targetId);
    assert.deepEqual(outcome, { status: "skipped", reason: "post-cancelled" });

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "failed");
    assert.equal(row?.lastErrorCode, "cancelled");
    assert.equal(row?.nextRetryAt, null);
    assert.equal(row?.lockedAt, null);

    // No execution row: the job was refused before one was started.
    assert.equal((await listExecutionRows(targetId)).length, 0);
    assert.equal(publishCallsFor("instagram").length, 0);

    const post = await getPostRow(postId);
    assert.equal(post?.status, "cancelled");
  });
});

describe("idempotency — resume never duplicates a post (Plan 23, 27)", () => {
  test("running the job twice for the same target publishes exactly once", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "instagram");

    setScript("instagram", {
      kind: "accepted",
      externalPostId: "ig-async-1",
      then: "published",
    });

    const first = await runJob(targetId, 1);
    assert.equal(first.status, "published");
    assert.equal(publishCallsFor("instagram").length, 1);

    // The worker died after the provider accepted the post and before the row
    // was marked `success`, so BullMQ redelivers the same job.
    await requeueTarget(targetId);

    const second = await runJob(targetId, 2);
    assert.equal(second.status, "published");

    // THE GUARANTEE: the provider's `publish` ran once across both runs.
    assert.equal(publishCallsFor("instagram").length, 1);

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "success");
    assert.equal(row?.externalPostId, "ig-async-1");

    // Two attempts, two execution rows, one provider call: the second attempt
    // only ever asked for the status of the post the first one created.
    const executions = await listExecutionRows(targetId);
    assert.equal(executions.length, 2);
    assert.deepEqual(
      executions.map((row) => row.attemptNumber),
      [1, 2],
    );
    assert.deepEqual(
      executions.map((row) => row.externalPostId),
      ["ig-async-1", "ig-async-1"],
    );
    assert.ok(statusCallsFor("instagram").length >= 1);

    const post = await getPostRow(postId);
    assert.equal(post?.status, "published");
  });

  test("a stored accepted handle resumes through getPublishStatus, not publish", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "instagram");

    setScript("instagram", {
      kind: "accepted",
      externalPostId: "ig-async-2",
      then: "published",
    });

    // An earlier attempt handed the post to the provider and was killed before
    // it could observe the result — this is the handle that makes the next
    // attempt ask for the status instead of publishing again.
    const previousExecutionId = await startExecution({
      postPlatformId: targetId,
      platform: "instagram",
      attemptNumber: 1,
      bullmqJobId: "job-lost",
    });
    await finishExecutionAccepted(previousExecutionId, {
      provider: "instagram",
      externalPostId: "ig-async-2",
      statusRef: "ig-async-2",
      published: false,
    });

    const outcome = await runJob(targetId, 2);

    assert.equal(outcome.status, "published");
    if (outcome.status !== "published") assert.fail("expected a published outcome");
    assert.equal(outcome.externalPostId, "ig-async-2");

    assert.equal(publishCallsFor("instagram").length, 0);
    assert.equal(statusCallsFor("instagram").length, 1);

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "success");
    assert.equal(row?.externalPostId, "ig-async-2");
    assert.equal((await getPostRow(postId))?.status, "published");
  });

  test("readResumeHandle turns a stored response_log back into a handle", () => {
    assert.equal(readResumeHandle(null), null);
    assert.equal(readResumeHandle({ published: false }), null);

    // Accepted: the status token is what the next attempt polls with.
    assert.deepEqual(
      readResumeHandle({
        externalPostId: "ig-1",
        statusRef: "ref-1",
        published: false,
      }),
      { externalPostId: "ig-1", statusRef: "ref-1", alreadyPublished: false },
    );

    // `sanitize()` redacts every /token/i key, which is why the handle is also
    // mirrored under `statusRef`. A redacted value must not become a handle.
    assert.deepEqual(
      readResumeHandle({
        externalPostId: "ig-1",
        statusToken: "[redacted]",
        statusRef: null,
        published: true,
      }),
      { externalPostId: "ig-1", statusRef: null, alreadyPublished: true },
    );

    assert.deepEqual(
      readResumeHandle({ externalPostId: "ig-1", statusToken: "ref-2" }),
      { externalPostId: "ig-1", statusRef: "ref-2", alreadyPublished: false },
    );
  });
});

describe("token refresh (Plan 7, 22)", () => {
  test("an expired token is refreshed before publishing and persisted", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "instagram");

    setScript("instagram", { kind: "published", externalPostId: "ig-refreshed" });

    const before = await getAccountRow(accountId);
    assert.ok(before);
    assert.equal(decryptSecret(before.encryptedAccessToken), "access-token");
    assert.ok(before.tokenExpiresAt);

    await expireAccountToken(accountId);

    const outcome = await runJob(targetId);
    assert.equal(outcome.status, "published");
    assert.equal(publishCallsFor("instagram").length, 1);

    const after = await getAccountRow(accountId);
    assert.ok(after);
    assert.notEqual(after.encryptedAccessToken, before.encryptedAccessToken);
    assert.equal(decryptSecret(after.encryptedAccessToken), "refreshed-instagram");
    assert.equal(after.status, "active");

    const expiresAt = after.tokenExpiresAt;
    assert.ok(expiresAt, "expected a new expiry");
    assert.ok(expiresAt.getTime() > Date.now());

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "success");
    assert.equal(row?.externalPostId, "ig-refreshed");
    assert.equal((await getPostRow(postId))?.status, "published");
  });
});

describe("claim, lock and recovery (Plan 23, 26)", () => {
  test("only one worker can claim a target", async () => {
    const accountId = await createAccount("facebook");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "facebook");

    const first = await claimPlatformForPublish(targetId, "worker-a");
    assert.equal(first.claimed, true);

    const second = await claimPlatformForPublish(targetId, "worker-b");
    assert.equal(second.claimed, false);
    if (second.claimed) assert.fail("expected the second claim to be refused");
    assert.equal(second.reason, "already-claimed-or-terminal");

    const row = await getTargetRow(targetId);
    assert.equal(row?.status, "processing");
    assert.equal(row?.lockedBy, "worker-a");
    assert.ok(row?.lockedAt instanceof Date);
  });

  test("releaseClaim clears the lock so the target can be picked up again", async () => {
    const accountId = await createAccount("facebook");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "facebook");

    const claim = await claimPlatformForPublish(targetId, "worker-a");
    assert.equal(claim.claimed, true);

    await releaseClaim(targetId);

    const released = await getTargetRow(targetId);
    assert.equal(released?.lockedAt, null);
    assert.equal(released?.lockedBy, null);
    assert.equal(released?.status, "processing");

    // A row still `processing` with no lock is immediately reclaimable.
    const reclaimed = await claimPlatformForPublish(targetId, "worker-b");
    assert.equal(reclaimed.claimed, true);
    assert.equal((await getTargetRow(targetId))?.lockedBy, "worker-b");
  });

  test("a lock older than STALE_LOCK_MINUTES is reclaimable", async () => {
    const accountId = await createAccount("instagram");
    const postId = await insertPost({ status: "processing" });
    const targetId = await insertTarget(postId, accountId, "instagram");

    const claim = await claimPlatformForPublish(targetId, "worker-a");
    assert.equal(claim.claimed, true);

    // A worker that crashed holding the lock must not strand the job.
    await getDb()
      .update(postPlatforms)
      .set({
        lockedAt: new Date(Date.now() - (STALE_LOCK_MINUTES + 1) * 60_000),
      })
      .where(eq(postPlatforms.id, targetId));

    const reclaimed = await claimPlatformForPublish(targetId, "worker-b");
    assert.equal(reclaimed.claimed, true);
    assert.equal((await getTargetRow(targetId))?.lockedBy, "worker-b");
  });
});

describe("post status recompute (Plan 29)", () => {
  test("a scheduled post stays scheduled until every target is settled", async () => {
    const accounts = {
      instagram: await createAccount("instagram"),
      facebook: await createAccount("facebook"),
    };
    const postId = await insertPost({
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    const instagram = await insertTarget(postId, accounts.instagram, "instagram");
    const facebook = await insertTarget(postId, accounts.facebook, "facebook");

    assert.equal(await recomputePostStatus(postId, { scheduled: true }), "scheduled");

    await markTarget(instagram, "success");
    assert.equal(await recomputePostStatus(postId, { scheduled: true }), "scheduled");

    await markTarget(facebook, "success");
    assert.equal(await recomputePostStatus(postId, { scheduled: true }), "published");
    assert.ok((await getPostRow(postId))?.publishedAt instanceof Date);
  });
});
