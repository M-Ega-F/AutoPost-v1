import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";

import {
  contentTemplates,
  postMedia,
  postPlatforms,
  posts,
} from "@/lib/db/schema";
import {
  createTemplateForUser,
  deleteTemplateForUser,
  duplicatePostForUser,
  savePostAsTemplateForUser,
  updateTemplateForUser,
  createDraftFromTemplateForUser,
} from "@/lib/domain/reuse";
import { AppError } from "@/lib/errors";

import { db, seedUser } from "./db-harness";
import {
  OTHER_USER_ID,
  USER_ID,
  createAccount,
  insertPost,
  insertTarget,
  setupTestDatabase,
} from "./fixtures";

beforeEach(async () => {
  await setupTestDatabase();
  await seedUser(OTHER_USER_ID);
});

describe("post reuse", () => {
  test("duplicates reusable content into a clean draft without lifecycle state", async () => {
    const postId = await insertPost({ status: "published", scheduledAt: new Date(Date.now() + 60_000), caption: "Reusable caption" });
    const accountId = await createAccount("instagram");
    const targetId = await insertTarget(postId, accountId, "instagram", { status: "success" });
    await db.update(postPlatforms).set({ bullmqJobId: "old-job", externalPostId: "provider-1", lastErrorMessage: "old error" }).where(eq(postPlatforms.id, targetId));

    const result = await duplicatePostForUser(USER_ID, postId);
    assert.notEqual(result.postId, postId);
    assert.equal(result.status, "draft");

    const [draft] = await db.select().from(posts).where(eq(posts.id, result.postId));
    assert.equal(draft.status, "draft");
    assert.equal(draft.scheduledAt, null);
    assert.equal(draft.publishedAt, null);
    assert.equal(draft.cancelledAt, null);
    assert.equal(draft.contentText, "Reusable caption");

    const [media] = await db.select().from(postMedia).where(eq(postMedia.postId, result.postId));
    assert.equal(media.storageKey, `${USER_ID}/media/test.jpg`);
    const [target] = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, result.postId));
    assert.equal(target.status, "pending");
    assert.equal(target.bullmqJobId, null);
    assert.equal(target.externalPostId, null);
    assert.equal(target.lastErrorMessage, null);
  });

  test("does not duplicate another user's post and skips disconnected accounts", async () => {
    const foreignPost = await insertPost({ userId: OTHER_USER_ID });
    await assert.rejects(
      duplicatePostForUser(USER_ID, foreignPost),
      (error: unknown) => error instanceof AppError && error.code === "not_found",
    );

    const postId = await insertPost({ caption: "Account may be unavailable" });
    const disconnected = await createAccount("facebook", { status: "disconnected" });
    await insertTarget(postId, disconnected, "facebook");
    const result = await duplicatePostForUser(USER_ID, postId);
    const targets = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, result.postId));
    assert.equal(targets.length, 0);
  });
});

describe("content templates", () => {
  test("creates, updates, uses and deletes an owned template", async () => {
    const accountId = await createAccount("tiktok");
    const created = await createTemplateForUser(USER_ID, {
      name: "Launch copy",
      caption: "Reusable launch caption",
      platforms: ["tiktok"],
    });
    assert.equal(created.name, "Launch copy");
    assert.deepEqual(created.platforms, ["tiktok"]);

    const updated = await updateTemplateForUser(USER_ID, created.id, { name: "Updated launch" });
    assert.equal(updated.name, "Updated launch");
    assert.equal(updated.contentText, "Reusable launch caption");

    const used = await createDraftFromTemplateForUser(USER_ID, created.id);
    const [draft] = await db.select().from(posts).where(eq(posts.id, used.postId));
    assert.equal(draft.status, "draft");
    assert.equal(draft.scheduledAt, null);
    assert.equal(draft.contentText, "Reusable launch caption");
    const [target] = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, used.postId));
    assert.equal(target.socialAccountId, accountId);
    assert.equal(target.status, "pending");

    await deleteTemplateForUser(USER_ID, created.id);
    const remaining = await db.select().from(contentTemplates).where(eq(contentTemplates.id, created.id));
    assert.equal(remaining.length, 0);
  });

  test("save as template preserves reusable content while excluding post lifecycle", async () => {
    const postId = await insertPost({ status: "failed", caption: "Saved from a post" });
    const accountId = await createAccount("instagram");
    await insertTarget(postId, accountId, "instagram", { status: "failed" });
    const template = await savePostAsTemplateForUser(USER_ID, postId, "Saved post");
    assert.equal(template.contentText, "Saved from a post");
    assert.deepEqual(template.platforms, ["instagram"]);
    assert.ok(template.media);

    const used = await createDraftFromTemplateForUser(USER_ID, template.id);
    const [draft] = await db.select().from(posts).where(eq(posts.id, used.postId));
    assert.equal(draft.status, "draft");
    assert.equal(draft.scheduledAt, null);
    const [media] = await db.select().from(postMedia).where(eq(postMedia.postId, used.postId));
    assert.equal(media.storageKey, `${USER_ID}/media/test.jpg`);
  });
});
