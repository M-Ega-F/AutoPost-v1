import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { approvePost, requestPostChanges, submitPostForReview } from "@/lib/domain/post-approvals";
import { executePublishJob } from "@/lib/publishing/execute";
import { updateWorkspaceForUser } from "@/lib/domain/workspaces";
import { postReviewEvents, posts, userPreferences, workspaceMembers } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

import { db, seedUser } from "./db-harness";
import { createAccount, getTargetRow, insertPost, insertTarget, setupTestDatabase, USER_ID, OTHER_USER_ID } from "./fixtures";

beforeEach(async () => {
  await setupTestDatabase();
});

describe("content approval workflow", () => {
  test("submit, request changes, resubmit and approve are atomic and idempotent", async () => {
    const workspace = (await import("@/lib/domain/workspaces")).getActiveWorkspaceForUser;
    const current = (await workspace(USER_ID)).workspace;
    await updateWorkspaceForUser(USER_ID, { approvalRequired: true });
    await seedUser(OTHER_USER_ID);
    await db.insert(workspaceMembers).values({ workspaceId: current.id, userId: OTHER_USER_ID, role: "admin" });
    await db.insert(userPreferences).values({ userId: OTHER_USER_ID, activeWorkspaceId: current.id });
    const postId = await insertPost({ status: "draft", approvalStatus: "draft" });

    await submitPostForReview(USER_ID, postId);
    await submitPostForReview(USER_ID, postId);
    assert.equal((await db.select().from(postReviewEvents).where(eq(postReviewEvents.postId, postId))).length, 1);
    await assert.rejects(() => approvePost(USER_ID, postId), (error: unknown) => error instanceof AppError && error.code === "forbidden");
    await requestPostChanges(OTHER_USER_ID, postId, "Add the campaign CTA.");
    await submitPostForReview(USER_ID, postId);
    await approvePost(OTHER_USER_ID, postId);
    await approvePost(OTHER_USER_ID, postId);

    const [post] = await db.select({ approvalStatus: posts.approvalStatus }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, current.id)));
    assert.equal(post?.approvalStatus, "approved");
    assert.equal((await db.select().from(postReviewEvents).where(eq(postReviewEvents.postId, postId))).length, 4);
  });

  test("publishing worker refuses an unapproved target", async () => {
    const workspace = (await import("@/lib/domain/workspaces")).getActiveWorkspaceForUser;
    const current = (await workspace(USER_ID)).workspace;
    await updateWorkspaceForUser(USER_ID, { approvalRequired: true });
    const postId = await insertPost({ status: "draft", approvalStatus: "in_review" });
    const accountId = await createAccount("instagram");
    const targetId = await insertTarget(postId, accountId, "instagram");
    const outcome = await executePublishJob({ postPlatformId: targetId, attempt: 1, workerId: "approval-test-worker", bullmqJobId: "approval-test-job" });
    assert.deepEqual(outcome, { status: "skipped", reason: "approval-required" });
    assert.equal((await getTargetRow(targetId))?.status, "pending");
    assert.equal((await db.select().from(posts).where(eq(posts.id, postId))).find((row) => row.workspaceId === current.id)?.approvalStatus, "in_review");
  });
});
