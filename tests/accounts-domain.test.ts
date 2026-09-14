import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
  disconnectAccount,
  getAccountManagementSummary,
  listAccountManagementSummaries,
  saveConnectedAccounts,
} from "@/lib/domain/accounts";
import { retryPlatform } from "@/lib/domain/posts";
import { postPlatforms, socialAccounts } from "@/lib/db/schema";

import {
  OTHER_USER_ID,
  USER_ID,
  createAccount,
  getAccountRow,
  getTargetRow,
  insertPost,
  insertTarget,
  setupTestDatabase,
} from "./fixtures";
import { getDb } from "./db-harness";

test.beforeEach(async () => {
  await setupTestDatabase();
});

test("lists multiple accounts with aggregated usage and no credential fields", async () => {
  const instagramOne = await createAccount("instagram", {
    platformAccountId: "ig-1",
    username: "first_account",
  });
  const instagramTwo = await createAccount("instagram", {
    platformAccountId: "ig-2",
    username: "second_account",
  });

  const scheduledPost = await insertPost({
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 60_000),
  });
  await insertTarget(scheduledPost, instagramOne, "instagram");

  const publishedPost = await insertPost({ status: "published" });
  const publishedTarget = await insertTarget(
    publishedPost,
    instagramOne,
    "instagram",
    { status: "success" },
  );
  const publishedAt = new Date(Date.now() - 60_000);
  await getDb()
    .update(postPlatforms)
    .set({ publishedAt, updatedAt: publishedAt })
    .where(eq(postPlatforms.id, publishedTarget));

  const accounts = await listAccountManagementSummaries(USER_ID);
  const instagram = accounts.filter((account) => account.platform === "instagram");
  assert.equal(instagram.length, 2);

  const first = instagram.find((account) => account.id === instagramOne);
  assert.ok(first);
  assert.equal(first.scheduledPostCount, 1);
  assert.equal(first.pendingTargetCount, 1);
  assert.equal(first.lastSuccessfulPublishAt?.getTime(), publishedAt.getTime());
  assert.equal(first.lastFailedPublishAt, null);
  assert.equal(first.capabilities.multipleAccounts, true);
  assert.equal("encryptedAccessToken" in first, false);
  assert.equal("encryptedRefreshToken" in first, false);
  assert.equal(instagram.find((account) => account.id === instagramTwo)?.pendingTargetCount, 0);
});

test("account detail enforces ownership", async () => {
  await getDb().execute(
    `insert into auth.users (id) values ('${OTHER_USER_ID}') on conflict do nothing`,
  );
  const accountId = await createAccount("facebook", { userId: OTHER_USER_ID });

  assert.equal(await getAccountManagementSummary(USER_ID, accountId), null);
  assert.ok(await getAccountManagementSummary(OTHER_USER_ID, accountId));
});

test("disconnect refuses an account with a processing target and leaves it connected", async () => {
  const accountId = await createAccount("tiktok");
  const postId = await insertPost({ status: "processing" });
  const targetId = await insertTarget(postId, accountId, "tiktok", {
    status: "processing",
  });

  await assert.rejects(
    () => disconnectAccount(USER_ID, accountId),
    /currently being used to publish/,
  );

  assert.equal((await getAccountRow(accountId))?.status, "active");
  assert.equal((await getTargetRow(targetId))?.status, "processing");
});

test("reconnect updates an existing provider account instead of creating a duplicate", async () => {
  const accountId = await createAccount("x", {
    platformAccountId: "x-stable-id",
    username: "before_reconnect",
    status: "needs_reconnect",
  });

  await saveConnectedAccounts(USER_ID, [
    {
      platform: "x",
      platformAccountId: "x-stable-id",
      username: "after_reconnect",
      displayName: "After reconnect",
      avatarUrl: null,
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      scopes: "tweet.read tweet.write",
    },
  ]);

  const rows = await getDb()
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.userId, USER_ID));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, accountId);
  assert.equal(rows[0].username, "after_reconnect");
  assert.equal(rows[0].status, "active");
  assert.notEqual(rows[0].encryptedAccessToken, "");
});

test("retry blocks an expired account until it is reconnected", async () => {
  const accountId = await createAccount("linkedin");
  const postId = await insertPost({ status: "failed" });
  const targetId = await insertTarget(postId, accountId, "linkedin", {
    status: "failed",
  });
  await getDb()
    .update(socialAccounts)
    .set({ tokenExpiresAt: new Date(Date.now() - 60_000) })
    .where(eq(socialAccounts.id, accountId));

  await assert.rejects(
    () => retryPlatform(USER_ID, targetId),
    /needs reconnection/,
  );
  assert.equal((await getTargetRow(targetId))?.status, "failed");
});
