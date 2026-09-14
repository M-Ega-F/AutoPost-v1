import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { postReviewEvents, posts, workspaces } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { notifyContentReviewEvent } from "@/lib/domain/notifications";
import { emitWebhookEventSafely, type WebhookEventType } from "@/lib/webhooks/events";

export const APPROVAL_STATUSES = ["not_required", "draft", "in_review", "changes_requested", "approved"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ReviewAction = "submitted" | "approved" | "changes_requested" | "resubmitted" | "invalidated";

export type PostReview = {
  postId: string;
  workspaceId: string;
  approvalRequired: boolean;
  status: ApprovalStatus;
  requesterId: string | null;
  requestedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  lastComment: string | null;
  history: Array<{ id: string; action: ReviewAction; actorId: string | null; comment: string | null; createdAt: Date }>;
};

export function canTransitionApprovalStatus(from: ApprovalStatus, to: ApprovalStatus): boolean {
  if (from === "not_required") return to === "draft" || to === "in_review";
  if (from === "draft") return to === "in_review";
  if (from === "in_review") return to === "approved" || to === "changes_requested";
  if (from === "changes_requested") return to === "in_review" || to === "draft";
  if (from === "approved") return to === "draft";
  return false;
}

function webhookFor(action: ReviewAction): WebhookEventType {
  return action === "submitted" ? "post.review_requested"
    : action === "approved" ? "post.approved"
      : action === "changes_requested" ? "post.changes_requested"
        : action === "resubmitted" ? "post.resubmitted"
          : "post.approval_invalidated";
}

async function loadReview(postId: string, workspaceId: string): Promise<PostReview> {
  const [[post], history] = await Promise.all([
    db.select({
      id: posts.id,
      workspaceId: posts.workspaceId,
      approvalRequired: workspaces.approvalRequired,
      status: posts.approvalStatus,
      requesterId: posts.reviewRequestedBy,
      requestedAt: posts.reviewRequestedAt,
      approvedBy: posts.approvedBy,
      approvedAt: posts.approvedAt,
      lastComment: posts.lastReviewComment,
    }).from(posts).innerJoin(workspaces, eq(workspaces.id, posts.workspaceId)).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId))).limit(1),
    db.select({ id: postReviewEvents.id, action: postReviewEvents.action, actorId: postReviewEvents.actorId, comment: postReviewEvents.comment, createdAt: postReviewEvents.createdAt }).from(postReviewEvents).where(and(eq(postReviewEvents.postId, postId), eq(postReviewEvents.workspaceId, workspaceId))).orderBy(asc(postReviewEvents.createdAt), asc(postReviewEvents.id)),
  ]);
  if (!post) throw new AppError("not_found", "Post not found.");
  return { postId: post.id, workspaceId: post.workspaceId, approvalRequired: post.approvalRequired, status: post.status as ApprovalStatus, requesterId: post.requesterId, requestedAt: post.requestedAt, approvedBy: post.approvedBy, approvedAt: post.approvedAt, lastComment: post.lastComment, history: history.map((event) => ({ ...event, action: event.action as ReviewAction })) };
}

export async function getPostReviewForUser(userId: string, postId: string): Promise<PostReview> {
  const context = await requireWorkspacePermission(userId, "posts:view");
  return loadReview(postId, context.workspaceId);
}

type ActionKind = "submit" | "approve" | "request_changes";

async function applyAction(userId: string, postId: string, kind: ActionKind, comment?: string): Promise<PostReview> {
  const permission = kind === "submit" ? "drafts:update" : "content:review";
  const context = await requireWorkspacePermission(userId, permission);
  const workspaceId = context.workspaceId;
  const outcome = await db.transaction(async (tx) => {
    const [post] = await tx.select({ id: posts.id, userId: posts.userId, status: posts.status, approvalStatus: posts.approvalStatus, approvalRequired: workspaces.approvalRequired, requesterId: posts.reviewRequestedBy }).from(posts).innerJoin(workspaces, eq(workspaces.id, posts.workspaceId)).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId))).limit(1);
    if (!post) throw new AppError("not_found", "Post not found.");
    if (!post.approvalRequired) throw new AppError("conflict", "Content approval is not enabled for this workspace.");
    if (kind === "submit" && post.userId !== userId) throw new AppError("forbidden", "Only the post creator can submit this post for review.");
    if (kind === "approve" && post.requesterId === userId) throw new AppError("forbidden", "The requester cannot approve their own post.");

    const current = post.approvalStatus as ApprovalStatus;
    if (kind === "submit" && current === "in_review" && post.requesterId === userId) return { eventId: null };
    if (kind === "approve" && current === "approved") return { eventId: null };
    if (kind === "request_changes" && current === "changes_requested") return { eventId: null };

    const next: ApprovalStatus = kind === "submit" ? "in_review" : kind === "approve" ? "approved" : "changes_requested";
    if (post.status !== "draft" && kind === "submit") throw new AppError("conflict", "Only drafts can be submitted for review.");
    if (!canTransitionApprovalStatus(current, next)) throw new AppError("conflict", "This approval action is no longer available.");
    if (kind === "request_changes" && !comment?.trim()) throw new AppError("validation_failed", "Add a comment explaining the requested changes.");

    const action: ReviewAction = kind === "submit" && current === "changes_requested" ? "resubmitted" : kind === "submit" ? "submitted" : kind === "approve" ? "approved" : "changes_requested";
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId, action, actorId: userId, comment: comment?.trim().slice(0, 1000) ?? null }).returning({ id: postReviewEvents.id });
    if (!event) throw new AppError("server_error", "We couldn't record the review action.");
    await tx.update(posts).set({ approvalStatus: next, reviewRequestedBy: kind === "submit" ? userId : post.requesterId, reviewRequestedAt: kind === "submit" ? new Date() : undefined, approvedBy: kind === "approve" ? userId : null, approvedAt: kind === "approve" ? new Date() : null, lastReviewComment: comment?.trim().slice(0, 1000) ?? null, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId), eq(posts.approvalStatus, current)));
    return { eventId: event.id, action, next };
  });

  if (outcome.eventId) {
    await notifyContentReviewEvent({ postId, workspaceId, actorId: userId, action: outcome.action, eventId: outcome.eventId, comment });
    void emitWebhookEventSafely({ workspaceId, type: webhookFor(outcome.action), eventId: outcome.eventId, data: { postId, actorId: userId, reviewStatus: outcome.next, reviewEventId: outcome.eventId } });
  }
  return loadReview(postId, workspaceId);
}

export function submitPostForReview(userId: string, postId: string): Promise<PostReview> {
  return applyAction(userId, postId, "submit");
}

export function approvePost(userId: string, postId: string): Promise<PostReview> {
  return applyAction(userId, postId, "approve");
}

export function requestPostChanges(userId: string, postId: string, comment: string): Promise<PostReview> {
  return applyAction(userId, postId, "request_changes", comment);
}

export async function invalidatePostApproval(userId: string, postId: string): Promise<void> {
  const context = await requireWorkspacePermission(userId, "posts:update");
  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select({ approvalStatus: posts.approvalStatus }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId))).limit(1);
    if (!post || post.approvalStatus !== "approved") return null;
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: "invalidated", actorId: userId }).returning({ id: postReviewEvents.id });
    await tx.update(posts).set({ approvalStatus: "draft", approvedBy: null, approvedAt: null, lastReviewComment: null, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId), eq(posts.approvalStatus, "approved")));
    return event?.id ?? null;
  });
  if (result) {
    await notifyContentReviewEvent({ postId, workspaceId: context.workspaceId, actorId: userId, action: "invalidated", eventId: result });
    void emitWebhookEventSafely({ workspaceId: context.workspaceId, type: "post.approval_invalidated", eventId: result, data: { postId, actorId: userId, reviewStatus: "draft", reviewEventId: result } });
  }
}
