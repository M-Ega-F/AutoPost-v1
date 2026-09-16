import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { addReviewComment, assignReviewer, deleteReviewComment, editReviewComment, getReviewDetail, setReviewCommentResolved } from "@/lib/domain/reviews";
import { processReviewAutomationBatch } from "@/lib/domain/review-automation";
import { submitPostForReview } from "@/lib/domain/post-approvals";
import { notifications, postReviewAutomationEvents, postReviewCommentMentions, posts, userPreferences, workspaceMembers } from "@/lib/db/schema";
import { updateWorkspaceForUser, getActiveWorkspaceForUser } from "@/lib/domain/workspaces";

import { db, seedUser } from "./db-harness";
import { insertPost, setupTestDatabase, USER_ID } from "./fixtures";

const REVIEWER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(async () => { await setupTestDatabase(); });

test("review comments support replies, mentions, edit, soft delete and resolve", async () => {
  const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
  await updateWorkspaceForUser(USER_ID, { approvalRequired: true });
  await seedUser(REVIEWER_ID);
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: REVIEWER_ID, role: "admin" });
  await db.insert(userPreferences).values({ userId: USER_ID, displayName: "Author", activeWorkspaceId: workspace.id }).onConflictDoUpdate({ target: userPreferences.userId, set: { displayName: "Author", activeWorkspaceId: workspace.id } });
  await db.insert(userPreferences).values({ userId: REVIEWER_ID, displayName: "Reviewer", activeWorkspaceId: workspace.id }).onConflictDoUpdate({ target: userPreferences.userId, set: { displayName: "Reviewer", activeWorkspaceId: workspace.id } });

  const postId = await insertPost({ status: "draft", approvalStatus: "draft" });
  await submitPostForReview(USER_ID, postId);
  await assignReviewer(USER_ID, postId, REVIEWER_ID);

  const root = await addReviewComment(REVIEWER_ID, postId, "Please check this, @Author.");
  const reply = await addReviewComment(USER_ID, postId, "Will do.", root.id);
  assert.equal(reply.parentCommentId, root.id);
  assert.deepEqual((await db.select().from(postReviewCommentMentions).where(eq(postReviewCommentMentions.commentId, root.id))).map((row) => row.mentionedUserId), [USER_ID]);

  const edited = await editReviewComment(REVIEWER_ID, postId, root.id, "Updated context for @Author.");
  assert.ok(edited.editedAt);
  const resolved = await setReviewCommentResolved(REVIEWER_ID, postId, root.id, true);
  assert.ok(resolved.resolvedAt);
  const deleted = await deleteReviewComment(USER_ID, postId, reply.id);
  assert.ok(deleted.deletedAt);

  const detail = await getReviewDetail(USER_ID, postId);
  assert.equal(detail.status, "in_review");
  assert.equal(detail.comments.length, 2);
  assert.equal(detail.comments.find((comment) => comment.id === root.id)?.body, "Updated context for @Author.");
  assert.equal(detail.comments.find((comment) => comment.id === reply.id)?.body, "");
  assert.equal((await db.select({ approvalStatus: posts.approvalStatus }).from(posts).where(eq(posts.id, postId)))[0]?.approvalStatus, "in_review");
});

test("review automation is idempotent and stops when the review is completed", async () => {
  const workspace = (await getActiveWorkspaceForUser(USER_ID)).workspace;
  await updateWorkspaceForUser(USER_ID, { approvalRequired: true });
  await seedUser(REVIEWER_ID);
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: REVIEWER_ID, role: "admin" });
  const postId = await insertPost({ status: "draft", approvalStatus: "in_review" });
  const dueAt = new Date(Date.now() + 60 * 60_000);
  await db.update(posts).set({ assignedReviewerId: REVIEWER_ID, reviewDueAt: dueAt }).where(eq(posts.id, postId));

  const first = await processReviewAutomationBatch(new Date());
  const second = await processReviewAutomationBatch(new Date());
  assert.equal(first.claimed, 2);
  assert.equal(second.claimed, 0);
  assert.equal(second.skipped, 2);
  assert.equal((await db.select().from(postReviewAutomationEvents).where(eq(postReviewAutomationEvents.postId, postId))).length, 2);
  assert.equal((await db.select().from(notifications).where(eq(notifications.recipientId, REVIEWER_ID))).length, 2);

  await db.update(posts).set({ approvalStatus: "approved" }).where(eq(posts.id, postId));
  const completed = await processReviewAutomationBatch(new Date());
  assert.equal(completed.candidates, 0);
});
