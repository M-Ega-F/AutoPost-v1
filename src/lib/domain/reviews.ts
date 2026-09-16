import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";

import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { campaigns, postPlatforms, postReviewCommentMentions, postReviewComments, postReviewEvents, posts, userPreferences, workspaceMembers } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { notifyReviewCommentEvent, notifyReviewManagementEvent } from "@/lib/domain/notifications";
import { getPostReviewForUser, type PostReview } from "@/lib/domain/post-approvals";
import { emitWebhookEventSafely, type WebhookEventType } from "@/lib/webhooks/events";
import type { Platform } from "@/lib/status";
import { formatInZone, zonedTimeToUtc } from "@/lib/time";
import { measurePerf } from "@/lib/perf";

export const REVIEW_QUEUE_STATUSES = ["in_review", "changes_requested", "approved"] as const;
export type ReviewQueueStatus = (typeof REVIEW_QUEUE_STATUSES)[number];
export type ReviewQueueSort = "priority" | "oldest" | "newest" | "scheduled" | "deadline" | "updated";

export type ReviewInboxQuery = {
  page?: number;
  pageSize?: number;
  status?: ReviewQueueStatus;
  reviewer?: string;
  author?: string;
  platform?: Platform;
  campaignId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  sort?: ReviewQueueSort;
};

export type ReviewInboxItem = {
  id: string;
  contentText: string;
  postStatus: string;
  approvalStatus: ReviewQueueStatus;
  authorId: string;
  scheduledAt: Date | null;
  reviewRequestedAt: Date | null;
  reviewDueAt: Date | null;
  assignedReviewerId: string | null;
  isAssignedToMe: boolean;
  isOverdue: boolean;
  platforms: Platform[];
};

export type ReviewInboxResult = {
  items: ReviewInboxItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { pendingReview: number; assignedToMe: number; overdue: number; changesRequested: number; approvedToday: number };
  timezone: string;
};

export type ReviewComment = {
  id: string;
  postId: string;
  authorId: string | null;
  parentCommentId: string | null;
  body: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  mentionIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewCapabilities = {
  canApprove: boolean;
  canRequestChanges: boolean;
  canWithdraw: boolean;
  canAssignReviewer: boolean;
  canEditDeadline: boolean;
  canComment: boolean;
  canResolveComments: boolean;
};

export type ReviewDetail = PostReview & {
  viewerId: string;
  timezone: string;
  isOverdue: boolean;
  comments: ReviewComment[];
  capabilities: ReviewCapabilities;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, message: string): void {
  if (!uuidPattern.test(value)) throw new AppError("validation_failed", message);
}

function baseConditions(userId: string, workspaceId: string, role: Parameters<typeof hasPermission>[0]): SQL[] {
  const conditions: SQL[] = [eq(posts.workspaceId, workspaceId), inArray(posts.approvalStatus, REVIEW_QUEUE_STATUSES)];
  if (!hasPermission(role, "content:review")) conditions.push(eq(posts.userId, userId));
  return conditions;
}

function platformCondition(platform: Platform): SQL {
  return sql`exists (select 1 from ${postPlatforms} pp where pp.post_id = ${posts.id} and pp.platform = ${platform})`;
}

export function isReviewOverdue(dueAt: Date | null, status: string, now = Date.now()): boolean {
  return status === "in_review" && dueAt !== null && dueAt.getTime() < now;
}

export function reviewQueuePriority(input: { status: string; dueAt: Date | null; scheduledAt: Date | null }, now = Date.now()): number {
  if (isReviewOverdue(input.dueAt, input.status, now)) return 0;
  if (input.dueAt) return 1;
  if (input.scheduledAt) return 2;
  return 3;
}

async function loadPlatforms(postIds: readonly string[]): Promise<Map<string, Platform[]>> {
  const result = new Map<string, Platform[]>();
  if (postIds.length === 0) return result;
  const rows = await db.select({ postId: postPlatforms.postId, platform: postPlatforms.platform }).from(postPlatforms).where(inArray(postPlatforms.postId, postIds));
  for (const row of rows) {
    const platforms = result.get(row.postId) ?? [];
    platforms.push(row.platform as Platform);
    result.set(row.postId, platforms);
  }
  return result;
}

function queueOrder(sort: ReviewQueueSort) {
  if (sort === "oldest") return [asc(sql`coalesce(${posts.reviewRequestedAt}, ${posts.updatedAt})`), asc(posts.id)] as const;
  if (sort === "newest") return [desc(posts.createdAt), desc(posts.id)] as const;
  if (sort === "scheduled") return [asc(sql`coalesce(${posts.scheduledAt}, 'infinity'::timestamptz)`), desc(posts.updatedAt)] as const;
  if (sort === "deadline") return [asc(sql`coalesce(${posts.reviewDueAt}, 'infinity'::timestamptz)`), desc(posts.updatedAt)] as const;
  if (sort === "updated") return [desc(posts.updatedAt), desc(posts.id)] as const;
  const priority = sql`case when ${posts.approvalStatus} = 'in_review' and ${posts.reviewDueAt} < now() then 0 when ${posts.reviewDueAt} is not null then 1 when ${posts.scheduledAt} is not null then 2 else 3 end`;
  return [asc(priority), asc(sql`coalesce(${posts.reviewDueAt}, ${posts.scheduledAt}, ${posts.reviewRequestedAt}, ${posts.updatedAt})`), desc(posts.updatedAt)] as const;
}

export async function getReviewInbox(userId: string, query: ReviewInboxQuery = {}): Promise<ReviewInboxResult> {
  const context = await requireWorkspacePermission(userId, "posts:view");
  if (query.campaignId) {
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, query.campaignId), eq(campaigns.workspaceId, context.workspaceId))).limit(1);
    if (!campaign) throw new AppError("not_found", "We couldn't find that campaign.");
  }
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(query.pageSize ?? 20)));
  const conditions = baseConditions(userId, context.workspaceId, context.role);
  if (query.status) conditions.push(eq(posts.approvalStatus, query.status));
  if (query.reviewer) conditions.push(eq(posts.assignedReviewerId, query.reviewer === "me" ? userId : query.reviewer));
  if (query.author) conditions.push(eq(posts.userId, query.author));
  if (query.platform) conditions.push(platformCondition(query.platform));
  if (query.campaignId) conditions.push(eq(posts.campaignId, query.campaignId));
  if (query.from) conditions.push(gte(sql`coalesce(${posts.reviewRequestedAt}, ${posts.updatedAt})`, query.from));
  if (query.to) conditions.push(lt(sql`coalesce(${posts.reviewRequestedAt}, ${posts.updatedAt})`, query.to));
  if (query.search) conditions.push(ilike(posts.contentText, `%${query.search}%`));
  const where = and(...conditions);
  const [countRows, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(posts).where(where),
    db.select({ id: posts.id, contentText: posts.contentText, postStatus: posts.status, approvalStatus: posts.approvalStatus, authorId: posts.userId, scheduledAt: posts.scheduledAt, reviewRequestedAt: posts.reviewRequestedAt, reviewDueAt: posts.reviewDueAt, assignedReviewerId: posts.assignedReviewerId }).from(posts).where(where).orderBy(...queueOrder(query.sort ?? "priority")).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const now = Date.now();
  const platforms = await loadPlatforms(rows.map((row) => row.id));
  const items = rows.map((row) => ({ ...row, approvalStatus: row.approvalStatus as ReviewQueueStatus, isOverdue: isReviewOverdue(row.reviewDueAt, row.approvalStatus, now), isAssignedToMe: row.assignedReviewerId === userId, platforms: platforms.get(row.id) ?? [] }));

  const summaryConditions = baseConditions(userId, context.workspaceId, context.role);
  if (query.campaignId) summaryConditions.push(eq(posts.campaignId, query.campaignId));
  const todayLabel = formatInZone(new Date(), context.workspace.timezone, "yyyy-MM-dd");
  const [todayYear, todayMonth, todayDay] = todayLabel.split("-").map(Number);
  const tomorrowLabel = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + 1)).toISOString().slice(0, 10);
  const today = zonedTimeToUtc(todayLabel, "00:00", context.workspace.timezone);
  const tomorrow = zonedTimeToUtc(tomorrowLabel, "00:00", context.workspace.timezone);
  const [pending, assigned, overdue, changes, approvedToday] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(...summaryConditions, eq(posts.approvalStatus, "in_review"))),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(...summaryConditions, eq(posts.assignedReviewerId, userId), eq(posts.approvalStatus, "in_review"))),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(...summaryConditions, eq(posts.approvalStatus, "in_review"), lt(posts.reviewDueAt, new Date()))),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(...summaryConditions, eq(posts.approvalStatus, "changes_requested"))),
    db.select({ count: sql<number>`count(*)` }).from(posts).where(and(...summaryConditions, eq(posts.approvalStatus, "approved"), gte(posts.approvedAt, today), lt(posts.approvedAt, tomorrow))),
  ]);
  return { items, pagination: { page, pageSize, total, totalPages }, summary: { pendingReview: Number(pending[0]?.count ?? 0), assignedToMe: Number(assigned[0]?.count ?? 0), overdue: Number(overdue[0]?.count ?? 0), changesRequested: Number(changes[0]?.count ?? 0), approvedToday: Number(approvedToday[0]?.count ?? 0) }, timezone: context.workspace.timezone };
}

async function getReviewPost(userId: string, postId: string, permission: Permission = "posts:view") {
  const context = await requireWorkspacePermission(userId, permission);
  const [post] = await db.select({ id: posts.id, workspaceId: posts.workspaceId, userId: posts.userId, approvalStatus: posts.approvalStatus, assignedReviewerId: posts.assignedReviewerId, reviewDueAt: posts.reviewDueAt, reviewRequestedAt: posts.reviewRequestedAt, timezone: posts.timezone }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId))).limit(1);
  if (!post) throw new AppError("not_found", "Post not found.");
  return { context, post };
}

function managementWebhook(action: "reviewer_assigned" | "reviewer_changed" | "reviewer_unassigned" | "withdrawn" | "deadline_changed" | "comment_added"): WebhookEventType {
  return action === "withdrawn" ? "post.review_withdrawn" : action === "reviewer_assigned" ? "post.reviewer_assigned" : action === "reviewer_changed" ? "post.reviewer_changed" : action === "reviewer_unassigned" ? "post.reviewer_unassigned" : action === "deadline_changed" ? "post.review_deadline_changed" : "post.review_comment_added";
}

export async function assignReviewer(userId: string, postId: string, reviewerId: string | null): Promise<ReviewDetail> {
  if (reviewerId) requireUuid(reviewerId, "Choose a valid reviewer.");
  const context = await requireWorkspacePermission(userId, "content:review");
  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select({ id: posts.id, workspaceId: posts.workspaceId, authorId: posts.userId, approvalStatus: posts.approvalStatus, assignedReviewerId: posts.assignedReviewerId }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId))).limit(1);
    if (!post) throw new AppError("not_found", "Post not found.");
    if (post.approvalStatus !== "in_review") throw new AppError("conflict", "Only posts in review can have a reviewer assigned.");
    if (reviewerId === post.authorId) throw new AppError("forbidden", "The post creator cannot review their own post.");
    if (reviewerId) {
      const [member] = await tx.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, context.workspaceId), eq(workspaceMembers.userId, reviewerId), inArray(workspaceMembers.role, ["owner", "admin"]))).limit(1);
      if (!member) throw new AppError("forbidden", "Choose an active owner or admin in this workspace.");
    }
    if (post.assignedReviewerId === reviewerId) return { eventId: null, reviewerId };
    const action: "reviewer_assigned" | "reviewer_changed" | "reviewer_unassigned" = reviewerId === null ? "reviewer_unassigned" : post.assignedReviewerId ? "reviewer_changed" : "reviewer_assigned";
    const [updated] = await tx.update(posts).set({ assignedReviewerId: reviewerId, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId), eq(posts.approvalStatus, "in_review"))).returning({ id: posts.id });
    if (!updated) throw new AppError("conflict", "The post changed before the reviewer was updated.");
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action, actorId: userId }).returning({ id: postReviewEvents.id });
    return { eventId: event?.id ?? null, reviewerId, action };
  });
  if (result.eventId) {
    await notifyReviewManagementEvent({ postId, workspaceId: context.workspaceId, actorId: userId, action: result.action, eventId: result.eventId, reviewerId: result.reviewerId });
    void emitWebhookEventSafely({ workspaceId: context.workspaceId, type: managementWebhook(result.action), eventId: result.eventId, data: { postId, actorId: userId, reviewerId: result.reviewerId, reviewEventId: result.eventId } });
  }
  return getReviewDetail(userId, postId);
}

export async function setReviewDeadline(userId: string, postId: string, reviewDueAt: Date | null): Promise<ReviewDetail> {
  if (reviewDueAt && reviewDueAt.getTime() <= Date.now()) throw new AppError("validation_failed", "Choose a review deadline in the future.");
  const context = await requireWorkspacePermission(userId, "content:review");
  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select({ reviewDueAt: posts.reviewDueAt, approvalStatus: posts.approvalStatus }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId))).limit(1);
    if (!post) throw new AppError("not_found", "Post not found.");
    if (post.approvalStatus !== "in_review") throw new AppError("conflict", "Only posts in review can have a deadline.");
    if ((post.reviewDueAt?.getTime() ?? null) === (reviewDueAt?.getTime() ?? null)) return null;
    const [updated] = await tx.update(posts).set({ reviewDueAt, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId), eq(posts.approvalStatus, "in_review"))).returning({ id: posts.id });
    if (!updated) throw new AppError("conflict", "The post changed before the deadline was updated.");
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: "deadline_changed", actorId: userId }).returning({ id: postReviewEvents.id });
    return event?.id ?? null;
  });
  if (result) {
    await notifyReviewManagementEvent({ postId, workspaceId: context.workspaceId, actorId: userId, action: "deadline_changed", eventId: result });
    void emitWebhookEventSafely({ workspaceId: context.workspaceId, type: "post.review_deadline_changed", eventId: result, data: { postId, actorId: userId, reviewDueAt: reviewDueAt?.toISOString() ?? null, reviewEventId: result } });
  }
  return getReviewDetail(userId, postId);
}

export async function withdrawReview(userId: string, postId: string): Promise<ReviewDetail> {
  const context = await requireWorkspacePermission(userId, "posts:update");
  if (!hasPermission(context.role, "content:review")) {
    const post = await getReviewPost(userId, postId, "posts:update");
    if (post.post.userId !== userId) throw new AppError("forbidden", "Only the post creator can withdraw this review.");
  }
  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select({ approvalStatus: posts.approvalStatus }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId))).limit(1);
    if (!post) throw new AppError("not_found", "Post not found.");
    if (post.approvalStatus !== "in_review") throw new AppError("conflict", "Only posts in review can be withdrawn.");
    const [updated] = await tx.update(posts).set({ approvalStatus: "draft", reviewRequestedBy: null, reviewRequestedAt: null, assignedReviewerId: null, reviewDueAt: null, approvedBy: null, approvedAt: null, lastReviewComment: null, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId), eq(posts.approvalStatus, "in_review"))).returning({ id: posts.id });
    if (!updated) throw new AppError("conflict", "The review changed before it could be withdrawn.");
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: "withdrawn", actorId: userId }).returning({ id: postReviewEvents.id });
    return event?.id ?? null;
  });
  if (result) {
    await notifyReviewManagementEvent({ postId, workspaceId: context.workspaceId, actorId: userId, action: "withdrawn", eventId: result });
    void emitWebhookEventSafely({ workspaceId: context.workspaceId, type: "post.review_withdrawn", eventId: result, data: { postId, actorId: userId, reviewStatus: "draft", reviewEventId: result } });
  }
  return getReviewDetail(userId, postId);
}

function cleanComment(body: string): string {
  const clean = body.trim();
  if (!clean) throw new AppError("validation_failed", "Write a comment before sending it.");
  if (clean.length > 2000) throw new AppError("validation_failed", "The review comment is too long.");
  return clean;
}

function mentionTokenKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function resolveMentionIds(queryDb: typeof db, workspaceId: string, body: string): Promise<string[]> {
  const tokens = [...body.matchAll(/@([a-z0-9_.-]{1,80})/gi)].map((match) => match[1]);
  if (tokens.length === 0) return [];
  const members = await queryDb.select({ userId: workspaceMembers.userId, displayName: userPreferences.displayName }).from(workspaceMembers).leftJoin(userPreferences, eq(userPreferences.userId, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId));
  const ids: string[] = [];
  for (const token of tokens) {
    const normalized = mentionTokenKey(token);
    const member = members.find((candidate) => candidate.userId.toLowerCase() === token.toLowerCase() || mentionTokenKey(candidate.displayName ?? "") === normalized);
    if (!member) throw new AppError("validation_failed", `The mentioned workspace member @${token} could not be found.`);
    if (!ids.includes(member.userId)) ids.push(member.userId);
  }
  if (ids.length > 20) throw new AppError("validation_failed", "A comment can mention at most 20 workspace members.");
  return ids;
}

async function loadCommentMentions(queryDb: typeof db, commentIds: readonly string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (commentIds.length === 0) return result;
  const rows = await queryDb.select({ commentId: postReviewCommentMentions.commentId, userId: postReviewCommentMentions.mentionedUserId }).from(postReviewCommentMentions).where(inArray(postReviewCommentMentions.commentId, commentIds));
  for (const row of rows) result.set(row.commentId, [...(result.get(row.commentId) ?? []), row.userId]);
  return result;
}

function commentFromRow(row: { id: string; postId: string; authorId: string | null; parentCommentId: string | null; body: string; editedAt: Date | null; deletedAt: Date | null; deletedBy: string | null; resolvedAt: Date | null; resolvedBy: string | null; createdAt: Date; updatedAt: Date }, mentionIds: string[] = []): ReviewComment {
  return { ...row, mentionIds, body: row.deletedAt ? "" : row.body };
}

async function assertCommentParent(queryDb: typeof db, workspaceId: string, postId: string, parentCommentId: string | null): Promise<string | null> {
  if (!parentCommentId) return null;
  const [parent] = await queryDb.select({ id: postReviewComments.id, parentCommentId: postReviewComments.parentCommentId, deletedAt: postReviewComments.deletedAt }).from(postReviewComments).where(and(eq(postReviewComments.id, parentCommentId), eq(postReviewComments.workspaceId, workspaceId), eq(postReviewComments.postId, postId))).limit(1);
  if (!parent || parent.deletedAt) throw new AppError("conflict", "The reply target is no longer available.");
  return parent.parentCommentId ?? parent.id;
}

export async function addReviewComment(userId: string, postId: string, body: string, parentCommentId: string | null = null): Promise<ReviewComment> {
  const clean = cleanComment(body);
  const context = await requireWorkspacePermission(userId, "content:comments:create");
  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select({ approvalStatus: posts.approvalStatus }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, context.workspaceId))).limit(1);
    if (!post) throw new AppError("not_found", "Post not found.");
    if (post.approvalStatus !== "in_review" && post.approvalStatus !== "changes_requested") throw new AppError("conflict", "Comments are available while a post is being reviewed.");
    const rootParentId = await assertCommentParent(tx as unknown as typeof db, context.workspaceId, postId, parentCommentId);
    const mentionIds = await resolveMentionIds(tx as unknown as typeof db, context.workspaceId, clean);
    const [comment] = await tx.insert(postReviewComments).values({ postId, workspaceId: context.workspaceId, authorId: userId, parentCommentId: rootParentId, body: clean }).returning();
    if (!comment) throw new AppError("server_error", "We couldn't save the comment.");
    if (mentionIds.length > 0) await tx.insert(postReviewCommentMentions).values(mentionIds.map((mentionedUserId) => ({ commentId: comment.id, workspaceId: context.workspaceId, mentionedUserId })));
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: "comment_added", actorId: userId }).returning({ id: postReviewEvents.id });
    return { comment, eventId: event?.id ?? null, mentionIds };
  });
  if (result.eventId) {
    await notifyReviewCommentEvent({ postId, workspaceId: context.workspaceId, actorId: userId, action: "comment_added", commentId: result.comment.id, mentionedUserIds: result.mentionIds });
  }
  return commentFromRow(result.comment, result.mentionIds);
}

export async function getReviewDetail(userId: string, postId: string): Promise<ReviewDetail> {
  const review = await getPostReviewForUser(userId, postId);
  const context = await requireWorkspacePermission(userId, "posts:view");
  const commentRows = await measurePerf("[PERF][db]", "review.comments", () => db.select({ id: postReviewComments.id, postId: postReviewComments.postId, authorId: postReviewComments.authorId, parentCommentId: postReviewComments.parentCommentId, body: postReviewComments.body, editedAt: postReviewComments.editedAt, deletedAt: postReviewComments.deletedAt, deletedBy: postReviewComments.deletedBy, resolvedAt: postReviewComments.resolvedAt, resolvedBy: postReviewComments.resolvedBy, createdAt: postReviewComments.createdAt, updatedAt: postReviewComments.updatedAt }).from(postReviewComments).where(and(eq(postReviewComments.postId, postId), eq(postReviewComments.workspaceId, context.workspaceId))).orderBy(asc(postReviewComments.createdAt), asc(postReviewComments.id)), { queryCount: 1 });
  const mentions = await measurePerf("[PERF][db]", "review.commentMentions", () => loadCommentMentions(db, commentRows.map((comment) => comment.id)), { queryCount: commentRows.length > 0 ? 1 : 0 });
  const comments = commentRows.map((comment) => commentFromRow(comment, mentions.get(comment.id) ?? []));
  const canReview = hasPermission(context.role, "content:review");
  const canWithdraw = review.status === "in_review" && (canReview || review.requesterId === userId);
  return { ...review, viewerId: userId, timezone: context.workspace.timezone, isOverdue: isReviewOverdue(review.reviewDueAt, review.status), comments, capabilities: { canApprove: canReview && review.status === "in_review" && review.requesterId !== userId, canRequestChanges: canReview && review.status === "in_review" && review.requesterId !== userId, canWithdraw, canAssignReviewer: canReview && review.status === "in_review", canEditDeadline: canReview && review.status === "in_review", canComment: hasPermission(context.role, "content:comments:create") && (review.status === "in_review" || review.status === "changes_requested"), canResolveComments: hasPermission(context.role, "content:comments:resolve") } };
}

type StoredComment = {
  id: string;
  postId: string;
  workspaceId: string;
  authorId: string | null;
  parentCommentId: string | null;
  body: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function commentWithMentions(comment: StoredComment): Promise<ReviewComment> {
  const mentions = await loadCommentMentions(db, [comment.id]);
  return commentFromRow(comment, mentions.get(comment.id) ?? []);
}

async function assertCommentReview(tx: typeof db, workspaceId: string, postId: string): Promise<void> {
  const [post] = await tx.select({ approvalStatus: posts.approvalStatus }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId))).limit(1);
  if (!post) throw new AppError("not_found", "Post not found.");
  if (post.approvalStatus !== "in_review" && post.approvalStatus !== "changes_requested") throw new AppError("conflict", "Comments are available while a post is being reviewed.");
}

export async function editReviewComment(userId: string, postId: string, commentId: string, body: string): Promise<ReviewComment> {
  const clean = cleanComment(body);
  const context = await requireWorkspacePermission(userId, "content:comments:update");
  const result = await db.transaction(async (tx) => {
    await assertCommentReview(tx as unknown as typeof db, context.workspaceId, postId);
    const [current] = await tx.select().from(postReviewComments).where(and(eq(postReviewComments.id, commentId), eq(postReviewComments.postId, postId), eq(postReviewComments.workspaceId, context.workspaceId))).limit(1);
    if (!current) throw new AppError("not_found", "Review comment not found.");
    if (current.authorId !== userId) throw new AppError("forbidden", "You can only edit your own comments.");
    if (current.deletedAt) throw new AppError("conflict", "Deleted comments cannot be edited.");
    const mentionIds = await resolveMentionIds(tx as unknown as typeof db, context.workspaceId, clean);
    const [updated] = await tx.update(postReviewComments).set({ body: clean, editedAt: new Date(), updatedAt: new Date() }).where(and(eq(postReviewComments.id, commentId), eq(postReviewComments.postId, postId), eq(postReviewComments.authorId, userId), isNull(postReviewComments.deletedAt))).returning();
    if (!updated) throw new AppError("conflict", "The comment changed before it could be updated.");
    await tx.delete(postReviewCommentMentions).where(eq(postReviewCommentMentions.commentId, commentId));
    if (mentionIds.length > 0) await tx.insert(postReviewCommentMentions).values(mentionIds.map((mentionedUserId) => ({ commentId, workspaceId: context.workspaceId, mentionedUserId })));
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: "comment_updated", actorId: userId }).returning({ id: postReviewEvents.id });
    return { updated, eventId: event?.id ?? null, mentionIds };
  });
  if (result.eventId) await notifyReviewCommentEvent({ postId, workspaceId: context.workspaceId, actorId: userId, commentId, action: "comment_updated", mentionedUserIds: result.mentionIds });
  return commentWithMentions(result.updated as StoredComment);
}

export async function deleteReviewComment(userId: string, postId: string, commentId: string): Promise<ReviewComment> {
  const context = await requireWorkspacePermission(userId, "content:comments:delete");
  const result = await db.transaction(async (tx) => {
    await assertCommentReview(tx as unknown as typeof db, context.workspaceId, postId);
    const [current] = await tx.select().from(postReviewComments).where(and(eq(postReviewComments.id, commentId), eq(postReviewComments.postId, postId), eq(postReviewComments.workspaceId, context.workspaceId))).limit(1);
    if (!current) throw new AppError("not_found", "Review comment not found.");
    if (current.authorId !== userId) throw new AppError("forbidden", "You can only delete your own comments.");
    if (current.deletedAt) return { current, eventId: null };
    const [updated] = await tx.update(postReviewComments).set({ deletedAt: new Date(), deletedBy: userId, updatedAt: new Date() }).where(and(eq(postReviewComments.id, commentId), eq(postReviewComments.postId, postId), eq(postReviewComments.authorId, userId), isNull(postReviewComments.deletedAt))).returning();
    if (!updated) throw new AppError("conflict", "The comment changed before it could be deleted.");
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: "comment_deleted", actorId: userId }).returning({ id: postReviewEvents.id });
    return { current: updated, eventId: event?.id ?? null };
  });
  if (result.eventId) await notifyReviewCommentEvent({ postId, workspaceId: context.workspaceId, actorId: userId, commentId, action: "comment_deleted" });
  return commentWithMentions(result.current as StoredComment);
}

export async function setReviewCommentResolved(userId: string, postId: string, commentId: string, resolved: boolean): Promise<ReviewComment> {
  const context = await requireWorkspacePermission(userId, "content:comments:resolve");
  const result = await db.transaction(async (tx) => {
    await assertCommentReview(tx as unknown as typeof db, context.workspaceId, postId);
    const [current] = await tx.select().from(postReviewComments).where(and(eq(postReviewComments.id, commentId), eq(postReviewComments.postId, postId), eq(postReviewComments.workspaceId, context.workspaceId))).limit(1);
    if (!current) throw new AppError("not_found", "Review comment not found.");
    if (current.deletedAt) throw new AppError("conflict", "Deleted comments cannot be resolved.");
    if (current.parentCommentId) throw new AppError("validation_failed", "Only a root discussion can be resolved.");
    const isResolved = current.resolvedAt !== null;
    if (isResolved === resolved) return { current, eventId: null };
    const [updated] = await tx.update(postReviewComments).set({ resolvedAt: resolved ? new Date() : null, resolvedBy: resolved ? userId : null, updatedAt: new Date() }).where(and(eq(postReviewComments.id, commentId), eq(postReviewComments.postId, postId))).returning();
    if (!updated) throw new AppError("conflict", "The discussion changed before it could be updated.");
    const [event] = await tx.insert(postReviewEvents).values({ postId, workspaceId: context.workspaceId, action: resolved ? "comment_resolved" : "comment_reopened", actorId: userId }).returning({ id: postReviewEvents.id });
    return { current: updated, eventId: event?.id ?? null };
  });
  if (result.eventId) await notifyReviewCommentEvent({ postId, workspaceId: context.workspaceId, actorId: userId, commentId, action: resolved ? "comment_resolved" : "comment_reopened" });
  return commentWithMentions(result.current as StoredComment);
}

/** Removes assignments that became ineligible after a member leaves or loses review permission. */
export async function unassignReviewerForMember(workspaceId: string, reviewerId: string, actorId: string): Promise<void> {
  const changed = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: posts.id }).from(posts).where(and(eq(posts.workspaceId, workspaceId), eq(posts.assignedReviewerId, reviewerId), eq(posts.approvalStatus, "in_review")));
    const events: string[] = [];
    for (const row of rows) {
      const [updated] = await tx.update(posts).set({ assignedReviewerId: null, updatedAt: new Date() }).where(and(eq(posts.id, row.id), eq(posts.workspaceId, workspaceId), eq(posts.assignedReviewerId, reviewerId), eq(posts.approvalStatus, "in_review"))).returning({ id: posts.id });
      if (!updated) continue;
      const [event] = await tx.insert(postReviewEvents).values({ postId: row.id, workspaceId, action: "reviewer_unassigned", actorId }).returning({ id: postReviewEvents.id });
      if (event) events.push(event.id);
    }
    return events;
  });
  await Promise.all(changed.map(async (eventId) => {
    const [event] = await db.select({ postId: postReviewEvents.postId }).from(postReviewEvents).where(eq(postReviewEvents.id, eventId)).limit(1);
    if (!event) return;
    await notifyReviewManagementEvent({ postId: event.postId, workspaceId, actorId, action: "reviewer_unassigned", eventId, reviewerId: null });
    void emitWebhookEventSafely({ workspaceId, type: "post.reviewer_unassigned", eventId, data: { postId: event.postId, actorId, reviewEventId: eventId } });
  }));
}
