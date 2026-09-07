import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

import { createPost, retryPlatform } from "@/lib/domain/posts";
import { executePublishJob } from "@/lib/publishing/execute";

import {
  createAccount,
  getPostRow,
  insertPost,
  insertTarget,
  setupTestDatabase,
  TEST_MEDIA,
  USER_ID,
} from "./fixtures";
import { setScripts } from "./fake-providers";
import { enqueued, jobsFor } from "./fake-queue";

const WORKER = "test-worker";

before(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await setupTestDatabase();
});

describe("harness smoke", () => {
  test("createPost writes rows and enqueues one job per platform", async () => {
    const facebookAccount = await createAccount("facebook");
    const tiktokAccount = await createAccount("tiktok");

    const { postId } = await createPost({
      userId: USER_ID,
      contentText: "Harness check",
      timezone: "UTC",
      scheduledAt: null,
      media: TEST_MEDIA,
      targets: [
        { platform: "facebook", socialAccountId: facebookAccount },
        { platform: "tiktok", socialAccountId: tiktokAccount },
      ],
    });

    const post = await getPostRow(postId);
    assert.equal(post?.contentText, "Harness check");
    assert.equal(post?.status, "processing");
    assert.equal(enqueued.length, 2);
  });
});

describe("critical scenario (Plan section 42)", () => {
  test("Instagram fails, Facebook and TikTok succeed -> partial_failure; retry only hits Instagram", async () => {
    const accounts = {
      instagram: await createAccount("instagram"),
      facebook: await createAccount("facebook"),
      tiktok: await createAccount("tiktok"),
    };

    const postId = await insertPost({
      status: "processing",
      caption: "Promo September",
    });

    const platforms = ["instagram", "facebook", "tiktok"] as const;
    const targets = {} as Record<(typeof platforms)[number], string>;
    for (const platform of platforms) {
      targets[platform] = await insertTarget(postId, accounts[platform], platform);
    }

    setScripts({
      instagram: { kind: "error", code: "unsupported_media", retryable: false },
      facebook: { kind: "published", externalPostId: "fb-1" },
      tiktok: { kind: "published", externalPostId: "tt-1" },
    });

    let jobIndex = 0;
    for (const platform of platforms) {
      jobIndex += 1;
      await executePublishJob({
        postPlatformId: targets[platform],
        attempt: 1,
        workerId: WORKER,
        bullmqJobId: `job-${jobIndex}`,
      });
    }

    const post = await getPostRow(postId);
    assert.equal(post?.status, "partial_failure");

    enqueued.length = 0;
    await retryPlatform(USER_ID, targets.instagram);

    assert.deepEqual(
      enqueued.map((job) => job.postPlatformId),
      [targets.instagram],
    );
    assert.equal(jobsFor(targets.facebook).length, 0);
    assert.equal(jobsFor(targets.tiktok).length, 0);
  });
});
