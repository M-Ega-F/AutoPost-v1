import { strict as assert } from "node:assert";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import {
  getAnalyticsOverview,
  getPostAnalyticsDetail,
  saveAnalyticsSnapshot,
  syncPostPlatformAnalytics,
} from "@/lib/domain/analytics";
import { postPlatforms, posts } from "@/lib/db/schema";

import {
  OTHER_USER_ID,
  USER_ID,
  createAccount,
  insertPost,
  insertTarget,
  setupTestDatabase,
} from "./fixtures";
import { getDb } from "./db-harness";

test.beforeEach(async () => {
  await setupTestDatabase();
});

test("analytics keeps historical snapshots and aggregates the latest row", async () => {
  const accountId = await createAccount("instagram");
  const postId = await insertPost({ status: "published", caption: "A real post" });
  const targetId = await insertTarget(postId, accountId, "instagram", { status: "success" });
  await getDb().update(posts).set({ publishedAt: new Date() }).where(eq(posts.id, postId));
  await getDb().update(postPlatforms).set({ externalPostId: "ig-123" }).where(eq(postPlatforms.id, targetId));

  await saveAnalyticsSnapshot(USER_ID, {
    postPlatformId: targetId,
    status: "available",
    metrics: { views: 10, likes: 2, comments: null },
    collectedAt: new Date("2026-09-13T00:00:00.000Z"),
  });
  await saveAnalyticsSnapshot(USER_ID, {
    postPlatformId: targetId,
    status: "available",
    metrics: { views: 25, likes: 5, comments: 1 },
    collectedAt: new Date("2026-09-14T00:00:00.000Z"),
  });

  const overview = await getAnalyticsOverview(USER_ID, { range: "all", timeZone: "Asia/Jakarta" });
  assert.equal(overview.metrics.views, 25);
  assert.equal(overview.metrics.engagement, 6);
  assert.equal(overview.totalPublishedPosts, 1);
  assert.equal(overview.successRate, 1);

  const detail = await getPostAnalyticsDetail(USER_ID, postId);
  assert.equal(detail?.targets[0]?.history.length, 2);
  assert.equal(detail?.targets[0]?.latest?.views, 25);
});

test("analytics ownership and unsupported provider state are safe", async () => {
  const accountId = await createAccount("tiktok");
  const postId = await insertPost({ status: "published" });
  const targetId = await insertTarget(postId, accountId, "tiktok", { status: "success" });
  await getDb().update(posts).set({ publishedAt: new Date() }).where(eq(posts.id, postId));
  await getDb().update(postPlatforms).set({ externalPostId: "tt-123" }).where(eq(postPlatforms.id, targetId));

  const foreignView = await getPostAnalyticsDetail(OTHER_USER_ID, postId);
  assert.equal(foreignView, null);

  await syncPostPlatformAnalytics(targetId);
  const detail = await getPostAnalyticsDetail(USER_ID, postId);
  assert.equal(detail?.targets[0]?.status, "unavailable");
  assert.equal(detail?.targets[0]?.latest?.views, null);

  const [post] = await getDb().select({ status: posts.status }).from(posts).where(eq(posts.id, postId));
  assert.equal(post.status, "published");
});
