import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { createPost } from "@/lib/domain/posts";
import { executePublishJob } from "@/lib/publishing/execute";

import {
  createAccount,
  getPostRow,
  getTargetRow,
  setupTestDatabase,
  TEST_MEDIA,
  USER_ID,
} from "./fixtures";
import { publishCallsFor, setScripts } from "./fake-providers";
import { enqueued } from "./fake-queue";

beforeEach(async () => {
  await setupTestDatabase();
});

test("Threads uses the existing create-post, queue and worker lifecycle", async () => {
  const accountId = await createAccount("threads", {
    platformAccountId: "threads-user-1",
    username: "threads_user",
  });

  const { postId } = await createPost({
    userId: USER_ID,
    contentText: "Hello from Threads",
    timezone: "Asia/Jakarta",
    scheduledAt: null,
    media: TEST_MEDIA,
    targets: [{ platform: "threads", socialAccountId: accountId }],
  });

  assert.equal(enqueued.length, 1);
  const targetId = enqueued[0].postPlatformId;
  assert.equal((await getTargetRow(targetId))?.platform, "threads");

  await executePublishJob({
    postPlatformId: targetId,
    attempt: 1,
    workerId: "threads-test-worker",
    bullmqJobId: "threads-job-1",
  });

  assert.equal((await getTargetRow(targetId))?.status, "success");
  assert.equal((await getPostRow(postId))?.status, "published");
  assert.equal(publishCallsFor("threads").length, 1);
});

test("Threads participates in scheduled posts and partial failure", async () => {
  const threadsAccount = await createAccount("threads");
  const instagramAccount = await createAccount("instagram");
  const future = new Date(Date.now() + 60_000);
  const scheduled = await createPost({
    userId: USER_ID,
    contentText: "Scheduled Threads post",
    timezone: "UTC",
    scheduledAt: future,
    media: TEST_MEDIA,
    targets: [{ platform: "threads", socialAccountId: threadsAccount }],
  });
  assert.equal((await getPostRow(scheduled.postId))?.status, "scheduled");
  assert.equal(enqueued.length, 1);
  enqueued.length = 0;

  const mixed = await createPost({
    userId: USER_ID,
    contentText: "Threads partial failure",
    timezone: "UTC",
    scheduledAt: null,
    media: TEST_MEDIA,
    targets: [
      { platform: "threads", socialAccountId: threadsAccount },
      { platform: "instagram", socialAccountId: instagramAccount },
    ],
  });
  setScripts({
    threads: { kind: "error", code: "permission_denied" },
    instagram: { kind: "published", externalPostId: "ig-success" },
  });

  for (const job of enqueued) {
    await executePublishJob({
      postPlatformId: job.postPlatformId,
      attempt: 1,
      workerId: "threads-partial-worker",
      bullmqJobId: `threads-partial-${job.postPlatformId}`,
    });
  }

  assert.equal((await getPostRow(mixed.postId))?.status, "partial_failure");
});
