import "server-only";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  notifications,
  userPreferences,
  workspaceMembers,
  workspaces,
  notificationPriorityEnum,
  notificationTypeEnum,
  posts,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { measurePerf } from "@/lib/perf";
import {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  type NotificationItem,
  type NotificationMetadata,
  type NotificationPriority,
  type NotificationType,
} from "@/lib/notifications/types";
import {
  getAccountRecipient,
  getInvitationRecipient,
  getPostRecipient,
  getWorkspaceOwnerRecipient,
  isWorkspaceMember,
} from "@/lib/notifications/recipients";
import { emitWebhookEventSafely, type WebhookEventType } from "@/lib/webhooks/events";
import { enqueueCampaignEvaluation } from "@/lib/queue/campaign-automation";

const uuidSchema = z.string().uuid();
const metadataValueSchema = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const metadataSchema = z
  .record(z.string().max(80), metadataValueSchema)
  .refine((value) => JSON.stringify(value).length <= 4096, "Notification metadata is too large.")
  .refine(
    (value) => !Object.keys(value).some((key) => /(token|secret|password|cookie|credential|authorization)/i.test(key)),
    "Notification metadata contains a sensitive field.",
  );
const hrefSchema = z.string().max(500).regex(/^\/(?!\/)/, "Notification links must stay inside the application.");

const notificationInputSchema = z.object({
  workspaceId: uuidSchema,
  recipientId: uuidSchema,
  actorId: uuidSchema.nullish(),
  type: z.enum(NOTIFICATION_TYPES),
  priority: z.enum(NOTIFICATION_PRIORITIES),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  resourceType: z.string().trim().min(1).max(40).nullish(),
  resourceId: uuidSchema.nullish(),
  href: hrefSchema.nullish(),
  metadata: metadataSchema.default({}),
  dedupeKey: z.string().trim().min(1).max(200).nullish(),
});

export type CreateNotificationInput = z.input<typeof notificationInputSchema>;
export type NotificationQuery = { page?: number; limit?: number; unreadOnly?: boolean; type?: NotificationType };

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error as { code?: unknown }).code === "23505") return true;
  if ("cause" in error) return isUniqueViolation((error as { cause?: unknown }).cause);
  return false;
}

function toItem(row: typeof notifications.$inferSelect): NotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    priority: row.priority as NotificationPriority,
    title: row.title,
    message: row.message,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    href: row.href,
    metadata: (row.metadata ?? {}) as NotificationMetadata,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

async function getWorkspaceForNotificationsInternal(userId: string): Promise<{ workspaceId: string; role: Parameters<typeof hasPermission>[0] }> {
  const [preference] = await db.select({ workspaceId: userPreferences.activeWorkspaceId }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  const whereClause = preference?.workspaceId
    ? and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, preference.workspaceId))
    : eq(workspaceMembers.userId, userId);
  const [row] = await db
    .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(whereClause)
    .orderBy(desc(workspaces.isPersonal), desc(workspaces.updatedAt))
    .limit(1);
  if (!row) throw new AppError("forbidden", "You do not have access to the active workspace.");
  return row;
}

async function getWorkspaceForNotifications(userId: string): Promise<{ workspaceId: string; role: Parameters<typeof hasPermission>[0] }> {
  return measurePerf("[PERF][workspace]", "getWorkspaceForNotifications", () => getWorkspaceForNotificationsInternal(userId), { queryCount: 2 });
}

async function requireNotificationPermission(userId: string, permission: Permission): Promise<{ workspaceId: string; role: Parameters<typeof hasPermission>[0] }> {
  const context = await getWorkspaceForNotifications(userId);
  if (!hasPermission(context.role, permission)) throw new AppError("forbidden", "You don't have permission to access notifications.");
  return context;
}

async function findNotification(workspaceId: string, recipientId: string, notificationId: string): Promise<typeof notifications.$inferSelect | null> {
  const [row] = await db.select().from(notifications).where(and(eq(notifications.id, notificationId), eq(notifications.workspaceId, workspaceId), eq(notifications.recipientId, recipientId))).limit(1);
  return row ?? null;
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationItem> {
  const parsed = notificationInputSchema.parse(input);
  if (!(await isWorkspaceMember(parsed.workspaceId, parsed.recipientId)) && parsed.type !== "INVITATION_RECEIVED") {
    throw new AppError("forbidden", "Notification recipients must belong to the workspace.");
  }
  if (parsed.actorId && !(await isWorkspaceMember(parsed.workspaceId, parsed.actorId))) {
    throw new AppError("forbidden", "Notification actors must belong to the workspace.");
  }
  const values = {
    ...parsed,
    actorId: parsed.actorId ?? null,
    resourceType: parsed.resourceType ?? null,
    resourceId: parsed.resourceId ?? null,
    href: parsed.href ?? null,
    dedupeKey: parsed.dedupeKey ?? null,
    type: parsed.type as (typeof notificationTypeEnum.enumValues)[number],
    priority: parsed.priority as (typeof notificationPriorityEnum.enumValues)[number],
  };
  try {
    const [row] = await db.insert(notifications).values(values).returning();
    if (!row) throw new AppError("server_error", "We couldn't create the notification.");
    return toItem(row);
  } catch (error) {
    if (!isUniqueViolation(error) || !parsed.dedupeKey) throw error;
    const [existing] = await db.select().from(notifications).where(and(eq(notifications.workspaceId, parsed.workspaceId), eq(notifications.recipientId, parsed.recipientId), eq(notifications.dedupeKey, parsed.dedupeKey), isNull(notifications.readAt))).limit(1);
    if (!existing) throw error;
    return toItem(existing);
  }
}

export async function createNotifications(inputs: readonly CreateNotificationInput[]): Promise<NotificationItem[]> {
  const created: NotificationItem[] = [];
  for (const input of inputs) created.push(await createNotification(input));
  return created;
}

export async function createNotificationSafely(input: CreateNotificationInput, context: { event: string }): Promise<NotificationItem | null> {
  try {
    return await createNotification(input);
  } catch (error) {
    logger.error("notification creation failed", { event: context.event, type: input.type, workspaceId: input.workspaceId, recipientId: input.recipientId, resourceId: input.resourceId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function getNotifications(userId: string, query: NotificationQuery = {}): Promise<{ notifications: NotificationItem[]; pagination: { page: number; limit: number; total: number; totalPages: number }; unreadCount: number }> {
  const context = await requireNotificationPermission(userId, "notifications:view");
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(query.limit ?? 20)));
  const filters = [eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId), ...(query.unreadOnly ? [isNull(notifications.readAt)] : []), ...(query.type ? [eq(notifications.type, query.type)] : [])];
  const [rows, totalRows, unreadRows] = await measurePerf("[PERF][db]", "notifications.rows+total+unread", () => Promise.all([
    db.select().from(notifications).where(and(...filters)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(...filters)),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId), isNull(notifications.readAt))),
  ]), { queryCount: 3 });
  const total = Number(totalRows[0]?.count ?? 0);
  return { notifications: rows.map(toItem), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, unreadCount: Number(unreadRows[0]?.count ?? 0) };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const context = await requireNotificationPermission(userId, "notifications:view");
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function markAsRead(userId: string, notificationId: string): Promise<NotificationItem> {
  const context = await requireNotificationPermission(userId, "notifications:update");
  const current = await findNotification(context.workspaceId, userId, notificationId);
  if (!current) throw new AppError("not_found", "Notification not found.");
  if (!current.readAt) {
    const [updated] = await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, notificationId)).returning();
    return toItem(updated ?? current);
  }
  return toItem(current);
}

export async function markAllAsRead(userId: string): Promise<number> {
  const context = await requireNotificationPermission(userId, "notifications:update");
  const rows = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId), isNull(notifications.readAt))).returning({ id: notifications.id });
  return rows.length;
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  const context = await requireNotificationPermission(userId, "notifications:update");
  const rows = await db.delete(notifications).where(and(eq(notifications.id, notificationId), eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId))).returning({ id: notifications.id });
  if (rows.length === 0) throw new AppError("not_found", "Notification not found.");
}

export async function deleteAllRead(userId: string): Promise<number> {
  const context = await requireNotificationPermission(userId, "notifications:update");
  const rows = await db.delete(notifications).where(and(eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId), isNotNull(notifications.readAt))).returning({ id: notifications.id });
  return rows.length;
}

type PostEvent =
  | "POST_PUBLISHED"
  | "POST_FAILED"
  | "POST_PARTIAL_FAILURE"
  | "POST_SCHEDULED"
  | "POST_CANCELLED";

const postEventCopy: Record<PostEvent, { title: string; message: string; priority: NotificationPriority; href: string }> = {
  POST_PUBLISHED: { title: "Post published", message: "Your post was published successfully.", priority: "success", href: "/history" },
  POST_FAILED: { title: "Post failed", message: "Your post failed to publish. Review the post details and try again.", priority: "error", href: "/history" },
  POST_PARTIAL_FAILURE: { title: "Partial publish failure", message: "Your post was published to some platforms, but at least one platform failed.", priority: "warning", href: "/history" },
  POST_SCHEDULED: { title: "Post scheduled", message: "Your post is scheduled for publishing.", priority: "info", href: "/calendar" },
  POST_CANCELLED: { title: "Post cancelled", message: "Your scheduled post was cancelled.", priority: "info", href: "/history" },
};

export async function notifyPostEvent(postId: string, type: PostEvent, actorId?: string): Promise<void> {
  const recipient = await getPostRecipient(postId);
  if (!recipient) return;
  const [campaignPost] = await db.select({ campaignId: posts.campaignId }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, recipient.workspaceId))).limit(1);
  if (campaignPost?.campaignId) {
    const trigger = type === "POST_FAILED" || type === "POST_PARTIAL_FAILURE" ? "post_failed" : type === "POST_PUBLISHED" ? "published" : "campaign_updated";
    void enqueueCampaignEvaluation({ campaignId: campaignPost.campaignId, workspaceId: recipient.workspaceId, trigger, reason: trigger === "post_failed" || trigger === "published" ? "post_changed" : "campaign_changed", evaluationMode: "incremental" }).catch(() => undefined);
  }
  const copy = postEventCopy[type];
  const webhookType: Record<PostEvent, WebhookEventType> = {
    POST_PUBLISHED: "post.published",
    POST_FAILED: "post.failed",
    POST_PARTIAL_FAILURE: "post.partial_failure",
    POST_SCHEDULED: "post.scheduled",
    POST_CANCELLED: "post.cancelled",
  };
  void emitWebhookEventSafely({ workspaceId: recipient.workspaceId, type: webhookType[type], data: { postId, status: type.replace("POST_", "").toLowerCase() } });
  await createNotificationSafely(
    {
      workspaceId: recipient.workspaceId,
      recipientId: recipient.recipientId,
      actorId,
      type,
      priority: copy.priority,
      title: copy.title,
      message: copy.message,
      resourceType: "post",
      resourceId: postId,
      href: copy.href + "?post=" + postId,
      metadata: { postId },
    },
    { event: "post" },
  );
}

type ContentReviewNotification = "CONTENT_SUBMITTED_FOR_REVIEW" | "CONTENT_APPROVED" | "CONTENT_CHANGES_REQUESTED" | "CONTENT_RESUBMITTED" | "APPROVAL_INVALIDATED";
type ContentReviewAction = "submitted" | "approved" | "changes_requested" | "resubmitted" | "invalidated";

const contentReviewCopy: Record<ContentReviewNotification, { title: string; message: string; priority: NotificationPriority }> = {
  CONTENT_SUBMITTED_FOR_REVIEW: { title: "Post ready for review", message: "A post is waiting for your approval before publishing.", priority: "info" },
  CONTENT_APPROVED: { title: "Post approved", message: "Your post was approved and can now be published.", priority: "success" },
  CONTENT_CHANGES_REQUESTED: { title: "Changes requested", message: "A reviewer requested changes to your post.", priority: "warning" },
  CONTENT_RESUBMITTED: { title: "Post resubmitted", message: "Your post was resubmitted for review.", priority: "info" },
  APPROVAL_INVALIDATED: { title: "Approval invalidated", message: "This post changed after approval and needs review again.", priority: "warning" },
};

export async function notifyContentReviewEvent(input: { postId: string; workspaceId: string; actorId: string; action: ContentReviewAction; eventId: string; comment?: string }): Promise<void> {
  const type: ContentReviewNotification = input.action === "submitted" ? "CONTENT_SUBMITTED_FOR_REVIEW" : input.action === "approved" ? "CONTENT_APPROVED" : input.action === "changes_requested" ? "CONTENT_CHANGES_REQUESTED" : input.action === "resubmitted" ? "CONTENT_RESUBMITTED" : "APPROVAL_INVALIDATED";
  const copy = contentReviewCopy[type];
  const [post] = await db.select({ creatorId: posts.userId, campaignId: posts.campaignId }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId))).limit(1);
  if (!post) return;
  if (post.campaignId) void enqueueCampaignEvaluation({ campaignId: post.campaignId, workspaceId: input.workspaceId, trigger: "approval_changed", reason: "post_changed", evaluationMode: "incremental" }).catch(() => undefined);

  let recipientIds: string[];
  if (type === "CONTENT_APPROVED" || type === "CONTENT_CHANGES_REQUESTED" || type === "APPROVAL_INVALIDATED") {
    recipientIds = [post.creatorId];
  } else {
    const reviewers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
    recipientIds = reviewers.map((row) => row.userId).filter((id) => id !== input.actorId);
  }

  await Promise.all(recipientIds.map((recipientId) => createNotificationSafely({ workspaceId: input.workspaceId, recipientId, actorId: input.actorId, type, priority: copy.priority, title: copy.title, message: input.comment?.trim() ? `${copy.message} ${input.comment.trim().slice(0, 350)}` : copy.message, resourceType: "post", resourceId: input.postId, href: `/history?post=${input.postId}`, metadata: { postId: input.postId, reviewEventId: input.eventId }, dedupeKey: `content-review:${input.eventId}:${recipientId}` }, { event: "content_review" })));
}

type ReviewManagementAction = "reviewer_assigned" | "reviewer_changed" | "reviewer_unassigned" | "withdrawn" | "comment_added" | "deadline_changed";

const reviewManagementCopy: Record<ReviewManagementAction, { type: NotificationType; title: string; message: string; priority: NotificationPriority }> = {
  reviewer_assigned: { type: "REVIEWER_ASSIGNED", title: "Reviewer assigned", message: "A reviewer was assigned to a post.", priority: "info" },
  reviewer_changed: { type: "REVIEWER_CHANGED", title: "Reviewer changed", message: "The reviewer for a post was changed.", priority: "info" },
  reviewer_unassigned: { type: "REVIEWER_UNASSIGNED", title: "Reviewer unassigned", message: "A post is back in the shared review queue.", priority: "info" },
  withdrawn: { type: "REVIEW_WITHDRAWN", title: "Review withdrawn", message: "A post was withdrawn from review.", priority: "warning" },
  comment_added: { type: "REVIEW_COMMENT_ADDED", title: "New review comment", message: "A new comment was added to a post under review.", priority: "info" },
  deadline_changed: { type: "REVIEW_DEADLINE_CHANGED", title: "Review deadline updated", message: "The review deadline for a post was updated.", priority: "info" },
};

export async function notifyReviewManagementEvent(input: { postId: string; workspaceId: string; actorId: string; action: ReviewManagementAction; eventId: string; reviewerId?: string | null }): Promise<void> {
  const copy = reviewManagementCopy[input.action];
  const [post] = await db.select({ creatorId: posts.userId, assignedReviewerId: posts.assignedReviewerId }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId))).limit(1);
  if (!post) return;

  const members = await db.select({ userId: workspaceMembers.userId, role: workspaceMembers.role }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, input.workspaceId));
  const reviewers = members.filter((member) => member.role === "owner" || member.role === "admin").map((member) => member.userId);
  const recipientIds = new Set<string>();
  if (input.action === "reviewer_assigned" || input.action === "reviewer_changed") {
    if (input.reviewerId) recipientIds.add(input.reviewerId);
    recipientIds.add(post.creatorId);
  } else if (input.action === "reviewer_unassigned" || input.action === "withdrawn") {
    reviewers.forEach((id) => recipientIds.add(id));
    recipientIds.add(post.creatorId);
  } else {
    recipientIds.add(post.creatorId);
    if (post.assignedReviewerId) recipientIds.add(post.assignedReviewerId);
  }
  recipientIds.delete(input.actorId);

  await Promise.all([...recipientIds].map((recipientId) => createNotificationSafely({
    workspaceId: input.workspaceId,
    recipientId,
    actorId: input.actorId,
    type: copy.type,
    priority: copy.priority,
    title: copy.title,
    message: copy.message,
    resourceType: "post",
    resourceId: input.postId,
    href: `/history?post=${input.postId}`,
    metadata: { postId: input.postId, reviewEventId: input.eventId },
    dedupeKey: `review-management:${input.eventId}:${recipientId}`,
  }, { event: "review_management" })));
}

export type ReviewAutomationEvent = "deadline_approaching_24h" | "deadline_approaching_6h" | "overdue" | "escalated";

const reviewAutomationCopy: Record<ReviewAutomationEvent, { type: NotificationType; title: string; message: string; priority: NotificationPriority; webhook: WebhookEventType }> = {
  deadline_approaching_24h: { type: "REVIEW_DEADLINE_APPROACHING", title: "Review deadline approaching", message: "An assigned review is due within 24 hours.", priority: "warning", webhook: "post.review_deadline_approaching" },
  deadline_approaching_6h: { type: "REVIEW_DEADLINE_APPROACHING", title: "Review deadline soon", message: "An assigned review is due within 6 hours.", priority: "warning", webhook: "post.review_reminder_sent" },
  overdue: { type: "REVIEW_OVERDUE", title: "Review overdue", message: "An assigned review has passed its deadline.", priority: "error", webhook: "post.review_overdue" },
  escalated: { type: "REVIEW_ESCALATED", title: "Review escalated", message: "A review has been overdue for more than 24 hours and needs attention.", priority: "error", webhook: "post.review_escalated" },
};

export async function notifyReviewAutomationEvent(input: { postId: string; workspaceId: string; reviewerId: string | null; eventId: string; event: ReviewAutomationEvent; reviewDueAt: Date | null }): Promise<void> {
  const copy = reviewAutomationCopy[input.event];
  const [post] = await db.select({ assignedReviewerId: posts.assignedReviewerId }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId))).limit(1);
  if (!post) return;

  const recipients = new Set<string>();
  if (input.event === "escalated") {
    const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
    managers.forEach((member) => recipients.add(member.userId));
  } else if (post.assignedReviewerId && post.assignedReviewerId === input.reviewerId) {
    recipients.add(post.assignedReviewerId);
  }

  void emitWebhookEventSafely({ workspaceId: input.workspaceId, type: copy.webhook, eventId: input.eventId, data: { postId: input.postId, reviewerId: input.reviewerId, reviewDueAt: input.reviewDueAt?.toISOString() ?? null, automationEvent: input.event } });
  await Promise.all([...recipients].map((recipientId) => createNotificationSafely({
    workspaceId: input.workspaceId,
    recipientId,
    type: copy.type,
    priority: copy.priority,
    title: copy.title,
    message: copy.message,
    resourceType: "post",
    resourceId: input.postId,
    href: `/history?post=${input.postId}`,
    metadata: { postId: input.postId, reviewEventId: input.eventId, reviewerId: input.reviewerId, reviewDueAt: input.reviewDueAt?.toISOString() ?? null },
    dedupeKey: `review-automation:${input.eventId}:${recipientId}`,
  }, { event: "review_automation" })));
}

type ReviewCommentNotificationAction = "comment_added" | "comment_updated" | "comment_deleted" | "comment_resolved" | "comment_reopened";

const reviewCommentCopy: Record<ReviewCommentNotificationAction, { type: NotificationType; webhook: WebhookEventType; title: string; message: string; priority: NotificationPriority }> = {
  comment_added: { type: "REVIEW_COMMENT_ADDED", webhook: "post.review_comment_added", title: "New review comment", message: "A new comment was added to a review.", priority: "info" },
  comment_updated: { type: "REVIEW_COMMENT_UPDATED", webhook: "post.review_comment_updated", title: "Review comment updated", message: "A review comment was updated.", priority: "info" },
  comment_deleted: { type: "REVIEW_COMMENT_DELETED", webhook: "post.review_comment_deleted", title: "Review comment deleted", message: "A review comment was deleted.", priority: "info" },
  comment_resolved: { type: "REVIEW_COMMENT_RESOLVED", webhook: "post.review_comment_resolved", title: "Discussion resolved", message: "A review discussion was marked resolved.", priority: "success" },
  comment_reopened: { type: "REVIEW_COMMENT_REOPENED", webhook: "post.review_comment_reopened", title: "Discussion reopened", message: "A review discussion was reopened.", priority: "info" },
};

export async function notifyReviewCommentEvent(input: { postId: string; workspaceId: string; actorId: string; commentId: string; action: ReviewCommentNotificationAction; mentionedUserIds?: readonly string[] }): Promise<void> {
  const copy = reviewCommentCopy[input.action];
  const [post] = await db.select({ creatorId: posts.userId, assignedReviewerId: posts.assignedReviewerId }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId))).limit(1);
  if (!post) return;
  const recipients = new Set<string>([post.creatorId]);
  if (post.assignedReviewerId) recipients.add(post.assignedReviewerId);
  recipients.delete(input.actorId);

  void emitWebhookEventSafely({ workspaceId: input.workspaceId, type: copy.webhook, data: { postId: input.postId, actorId: input.actorId, commentId: input.commentId } });
  await Promise.all([...recipients].map((recipientId) => createNotificationSafely({ workspaceId: input.workspaceId, recipientId, actorId: input.actorId, type: copy.type, priority: copy.priority, title: copy.title, message: copy.message, resourceType: "post", resourceId: input.postId, href: `/history?post=${input.postId}`, metadata: { postId: input.postId, commentId: input.commentId }, dedupeKey: `review-comment:${input.commentId}:${input.action}:${recipientId}` }, { event: "review_comment" })));

  const mentions = [...new Set(input.mentionedUserIds ?? [])].filter((recipientId) => recipientId !== input.actorId);
  if (mentions.length > 0) {
    void emitWebhookEventSafely({ workspaceId: input.workspaceId, type: "post.review_mentioned", data: { postId: input.postId, commentId: input.commentId, actorId: input.actorId } });
    await Promise.all(mentions.map((recipientId) => createNotificationSafely({ workspaceId: input.workspaceId, recipientId, actorId: input.actorId, type: "REVIEW_MENTIONED", priority: "info", title: "You were mentioned", message: "You were mentioned in a review discussion.", resourceType: "post", resourceId: input.postId, href: `/history?post=${input.postId}`, metadata: { postId: input.postId, commentId: input.commentId }, dedupeKey: `review-mention:${input.commentId}:${recipientId}` }, { event: "review_mention" })));
  }
}

export type CampaignNotificationEvent = "created" | "updated" | "goal_updated" | "activated" | "completed" | "archived" | "deleted" | "post_added" | "post_removed";

const campaignEventCopy: Record<CampaignNotificationEvent, { type: NotificationType; webhook: WebhookEventType; title: string; message: string; priority: NotificationPriority }> = {
  created: { type: "CAMPAIGN_CREATED", webhook: "campaign.created", title: "Campaign created", message: "A new campaign was created in your workspace.", priority: "info" },
  updated: { type: "CAMPAIGN_UPDATED", webhook: "campaign.updated", title: "Campaign updated", message: "A campaign was updated.", priority: "info" },
  goal_updated: { type: "CAMPAIGN_GOAL_UPDATED", webhook: "campaign.goal_updated", title: "Campaign goal updated", message: "A campaign objective or target was updated.", priority: "info" },
  activated: { type: "CAMPAIGN_ACTIVATED", webhook: "campaign.activated", title: "Campaign activated", message: "A campaign is now active.", priority: "success" },
  completed: { type: "CAMPAIGN_COMPLETED", webhook: "campaign.completed", title: "Campaign completed", message: "A campaign was marked completed.", priority: "success" },
  archived: { type: "CAMPAIGN_ARCHIVED", webhook: "campaign.archived", title: "Campaign archived", message: "A campaign was archived.", priority: "warning" },
  deleted: { type: "CAMPAIGN_DELETED", webhook: "campaign.deleted", title: "Campaign deleted", message: "A campaign was deleted. Its posts remain in the workspace.", priority: "warning" },
  post_added: { type: "CAMPAIGN_POST_ADDED", webhook: "campaign.post_added", title: "Post added to campaign", message: "A post was added to a campaign.", priority: "info" },
  post_removed: { type: "CAMPAIGN_POST_REMOVED", webhook: "campaign.post_removed", title: "Post removed from campaign", message: "A post was removed from a campaign.", priority: "info" },
};

export async function notifyCampaignEvent(input: { workspaceId: string; campaignId: string; actorId: string; event: CampaignNotificationEvent; postId?: string }): Promise<void> {
  const copy = campaignEventCopy[input.event];
  const managers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
  const recipients = managers.map((member) => member.userId).filter((recipientId) => recipientId !== input.actorId);
  void emitWebhookEventSafely({
    workspaceId: input.workspaceId,
    type: copy.webhook,
    data: { campaignId: input.campaignId, postId: input.postId ?? null, actorId: input.actorId },
  });
  await Promise.all(recipients.map((recipientId) => createNotificationSafely({
    workspaceId: input.workspaceId,
    recipientId,
    actorId: input.actorId,
    type: copy.type,
    priority: copy.priority,
    title: copy.title,
    message: copy.message,
    resourceType: "campaign",
    resourceId: input.campaignId,
    href: `/campaigns/${input.campaignId}`,
    metadata: { campaignId: input.campaignId, postId: input.postId ?? null },
    dedupeKey: `campaign:${input.campaignId}:${input.event}:${input.postId ?? "none"}:${recipientId}`,
  }, { event: "campaign" })));
}

type CampaignAutomationNotificationEvent =
  | "goal_milestone"
  | "goal_completed"
  | "health_changed"
  | "deadline_warning"
  | "deadline_overdue"
  | "approval_bottleneck";

const campaignAutomationCopy: Record<CampaignAutomationNotificationEvent, {
  type: NotificationType;
  webhook: WebhookEventType;
  title: string;
  message: string;
  priority: NotificationPriority;
}> = {
  goal_milestone: { type: "CAMPAIGN_GOAL_MILESTONE", webhook: "campaign.goal_milestone", title: "Campaign goal milestone", message: "A campaign goal milestone was reached.", priority: "success" },
  goal_completed: { type: "CAMPAIGN_GOAL_COMPLETED", webhook: "campaign.goal_completed", title: "Campaign goal completed", message: "A campaign goal reached its target.", priority: "success" },
  health_changed: { type: "CAMPAIGN_HEALTH_WARNING", webhook: "campaign.health_changed", title: "Campaign health changed", message: "A campaign health signal needs attention.", priority: "warning" },
  deadline_warning: { type: "CAMPAIGN_DEADLINE_WARNING", webhook: "campaign.deadline_warning", title: "Campaign deadline approaching", message: "A campaign deadline is approaching.", priority: "warning" },
  deadline_overdue: { type: "CAMPAIGN_DEADLINE_OVERDUE", webhook: "campaign.deadline_overdue", title: "Campaign deadline overdue", message: "A campaign deadline has passed with unfinished work.", priority: "error" },
  approval_bottleneck: { type: "CAMPAIGN_APPROVAL_BOTTLENECK", webhook: "campaign.health_changed", title: "Campaign approval bottleneck", message: "Campaign content is waiting for approval.", priority: "warning" },
};

/** Sends actionable campaign automation alerts to managers, never viewers. */
export async function notifyCampaignAutomationEvent(input: {
  workspaceId: string;
  campaignId: string;
  event: CampaignAutomationNotificationEvent;
  eventKey?: string;
  state: string;
  metric?: string | null;
  targetValue?: number | null;
  currentValue?: number | null;
  progressPercent?: number | null;
  milestone?: number | null;
  daysRemaining?: number | null;
}): Promise<void> {
  const copy = campaignAutomationCopy[input.event];
  const eventKey = input.eventKey ?? `${input.campaignId}:${input.event}:${input.state}`;
  const managers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
  const metadata: NotificationMetadata = {
    campaignId: input.campaignId,
    eventKey,
    state: input.state,
    metric: input.metric ?? null,
    targetValue: input.targetValue ?? null,
    currentValue: input.currentValue ?? null,
    progressPercent: input.progressPercent ?? null,
    milestone: input.milestone ?? null,
    daysRemaining: input.daysRemaining ?? null,
  };
  void emitWebhookEventSafely({
    workspaceId: input.workspaceId,
    type: copy.webhook,
    eventId: eventKey,
    data: {
      campaignId: input.campaignId,
      eventType: input.event,
      state: input.state,
      metric: input.metric ?? null,
      targetValue: input.targetValue ?? null,
      currentValue: input.currentValue ?? null,
      progressPercent: input.progressPercent ?? null,
      milestone: input.milestone ?? null,
      daysRemaining: input.daysRemaining ?? null,
    },
  });
  await Promise.all(managers.map(({ userId }) => createNotificationSafely({
    workspaceId: input.workspaceId,
    recipientId: userId,
    type: copy.type,
    priority: copy.priority,
    title: copy.title,
    message: copy.message,
    resourceType: "campaign",
    resourceId: input.campaignId,
    href: `/campaigns/${input.campaignId}`,
    metadata,
    dedupeKey: `campaign-automation:${eventKey}:${userId}`,
  }, { event: "campaign_automation" })));
}

type CampaignIntelligenceNotificationEvent = "intelligence_updated" | "content_underperforming" | "recommendation_created";

const campaignIntelligenceCopy: Record<CampaignIntelligenceNotificationEvent, {
  type: NotificationType | null;
  webhook: WebhookEventType;
  title: string;
  message: string;
  priority: NotificationPriority;
}> = {
  intelligence_updated: { type: null, webhook: "campaign.intelligence_updated", title: "Campaign intelligence updated", message: "Campaign content intelligence has a meaningful update.", priority: "info" },
  content_underperforming: { type: "CAMPAIGN_CONTENT_UNDERPERFORMING", webhook: "campaign.content_underperforming", title: "Content underperforming", message: "Some campaign content is below the campaign performance baseline.", priority: "warning" },
  recommendation_created: { type: "CAMPAIGN_RECOMMENDATION", webhook: "campaign.recommendation_created", title: "Campaign recommendation", message: "A new data-backed optimization recommendation is available.", priority: "info" },
};

export async function notifyCampaignIntelligenceEvent(input: {
  workspaceId: string;
  campaignId: string;
  event: CampaignIntelligenceNotificationEvent;
  eventKey: string;
  state: string;
  dataQuality?: string | null;
  confidence?: string | null;
  underperformingCount?: number;
  topPerformerId?: string | null;
  recommendationType?: string | null;
}): Promise<void> {
  const copy = campaignIntelligenceCopy[input.event];
  void emitWebhookEventSafely({
    workspaceId: input.workspaceId,
    type: copy.webhook,
    eventId: input.eventKey,
    data: {
      campaignId: input.campaignId,
      intelligenceType: input.event,
      state: input.state,
      dataQuality: input.dataQuality ?? null,
      confidence: input.confidence ?? null,
      underperformingCount: input.underperformingCount ?? 0,
      topPerformerId: input.topPerformerId ?? null,
      recommendationType: input.recommendationType ?? null,
    },
  });
  if (!copy.type) return;
  const managers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
  const metadata: NotificationMetadata = {
    campaignId: input.campaignId,
    eventKey: input.eventKey,
    state: input.state,
    dataQuality: input.dataQuality ?? null,
    confidence: input.confidence ?? null,
    underperformingCount: input.underperformingCount ?? 0,
    topPerformerId: input.topPerformerId ?? null,
    recommendationType: input.recommendationType ?? null,
  };
  await Promise.all(managers.map(({ userId }) => createNotificationSafely({
    workspaceId: input.workspaceId,
    recipientId: userId,
    type: copy.type!,
    priority: copy.priority,
    title: copy.title,
    message: copy.message,
    resourceType: "campaign",
    resourceId: input.campaignId,
    href: `/campaigns/${input.campaignId}`,
    metadata,
    dedupeKey: `campaign-intelligence:${input.eventKey}:${userId}`,
  }, { event: "campaign_intelligence" })));
}

export type CampaignOptimizationNotificationEvent = "action_created" | "action_completed" | "experiment_created" | "experiment_started" | "experiment_paused" | "experiment_completed" | "experiment_cancelled" | "experiment_winner_detected" | "experiment_insufficient_data" | "experiment_statistical_milestone";

const campaignOptimizationCopy: Record<CampaignOptimizationNotificationEvent, { type: NotificationType; webhook: WebhookEventType; title: string; message: string; priority: NotificationPriority }> = {
  action_created: { type: "OPTIMIZATION_ACTION_CREATED", webhook: "optimization.action_created", title: "Optimization action created", message: "A campaign optimization action is ready for review.", priority: "info" },
  action_completed: { type: "OPTIMIZATION_ACTION_COMPLETED", webhook: "optimization.action_completed", title: "Optimization action completed", message: "A campaign optimization action was completed.", priority: "success" },
  experiment_created: { type: "CAMPAIGN_UPDATED", webhook: "experiment.created", title: "Experiment created", message: "A controlled campaign experiment was created.", priority: "info" },
  experiment_started: { type: "CAMPAIGN_UPDATED", webhook: "experiment.started", title: "Experiment started", message: "A campaign experiment is now running.", priority: "info" },
  experiment_paused: { type: "CAMPAIGN_UPDATED", webhook: "experiment.paused", title: "Experiment paused", message: "A campaign experiment was paused.", priority: "warning" },
  experiment_completed: { type: "CAMPAIGN_COMPLETED", webhook: "experiment.completed", title: "Experiment completed", message: "A campaign experiment has completed and can be reviewed.", priority: "success" },
  experiment_cancelled: { type: "CAMPAIGN_UPDATED", webhook: "experiment.cancelled", title: "Experiment cancelled", message: "A campaign experiment was cancelled.", priority: "warning" },
  experiment_winner_detected: { type: "EXPERIMENT_WINNER_DETECTED", webhook: "experiment.winner_detected", title: "Experiment winner detected", message: "A variant currently leads the control. Review the evidence before adopting it.", priority: "success" },
  experiment_insufficient_data: { type: "EXPERIMENT_INSUFFICIENT_DATA", webhook: "experiment.insufficient_data", title: "Experiment needs more data", message: "An experiment does not have enough comparable data yet.", priority: "warning" },
  experiment_statistical_milestone: { type: "EXPERIMENT_STATISTICAL_MILESTONE", webhook: "experiment.statistical_milestone", title: "Experiment evidence updated", message: "An experiment reached a meaningful statistical evidence milestone.", priority: "info" },
};

export async function notifyCampaignOptimizationEvent(input: { workspaceId: string; campaignId: string; event: CampaignOptimizationNotificationEvent; eventKey: string; optimizationActionId?: string | null; experimentId?: string | null; resultId?: string | null; winnerVariantId?: string | null; statisticalStatus?: string | null; uplift?: number | null; confidence?: number | null; sampleSize?: number | null; evaluatedAt?: string | null }): Promise<void> {
  const copy = campaignOptimizationCopy[input.event];
  const data = { campaignId: input.campaignId, optimizationActionId: input.optimizationActionId ?? null, experimentId: input.experimentId ?? null, resultId: input.resultId ?? null, winnerVariantId: input.winnerVariantId ?? null, statisticalStatus: input.statisticalStatus ?? null, uplift: input.uplift ?? null, confidence: input.confidence ?? null, sampleSize: input.sampleSize ?? null, evaluatedAt: input.evaluatedAt ?? null, eventType: input.event };
  void emitWebhookEventSafely({ workspaceId: input.workspaceId, type: copy.webhook, eventId: input.eventKey, data });
  const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
  const metadata: NotificationMetadata = { campaignId: input.campaignId, eventKey: input.eventKey, optimizationActionId: input.optimizationActionId ?? null, experimentId: input.experimentId ?? null, resultId: input.resultId ?? null, winnerVariantId: input.winnerVariantId ?? null };
  await Promise.all(managers.map(({ userId }) => createNotificationSafely({ workspaceId: input.workspaceId, recipientId: userId, type: copy.type, priority: copy.priority, title: copy.title, message: copy.message, resourceType: "campaign", resourceId: input.campaignId, href: `/campaigns/${input.campaignId}`, metadata, dedupeKey: `campaign-optimization:${input.eventKey}:${userId}` }, { event: "campaign_optimization" })));
}

export async function notifyAccountEvent(
  accountId: string,
  type: "ACCOUNT_EXPIRED" | "ACCOUNT_RECONNECT_REQUIRED" | "ACCOUNT_DISCONNECTED",
): Promise<void> {
  const recipient = await getAccountRecipient(accountId);
  if (!recipient) return;
  const webhookType = type === "ACCOUNT_EXPIRED" ? "account.expired" : type === "ACCOUNT_RECONNECT_REQUIRED" ? "account.reconnect_required" : "account.disconnected";
  void emitWebhookEventSafely({ workspaceId: recipient.workspaceId, type: webhookType, data: { accountId } });
  const title = type === "ACCOUNT_EXPIRED"
    ? "Account token expired"
    : type === "ACCOUNT_DISCONNECTED"
      ? "Account disconnected"
      : "Reconnect required";
  const message = type === "ACCOUNT_EXPIRED"
    ? "A connected account needs attention because its token expired."
    : type === "ACCOUNT_DISCONNECTED"
      ? "A connected account was disconnected."
      : "A connected account needs to be reconnected before publishing can continue.";
  await createNotificationSafely(
    {
      ...recipient,
      type,
      priority: "warning",
      title,
      message,
      resourceType: "social_account",
      resourceId: accountId,
      href: "/connected-accounts",
      metadata: { accountId },
      dedupeKey: "account:" + accountId + ":" + type,
    },
    { event: "account" },
  );
}

export async function notifyInvitationReceived(invitationId: string, actorId?: string): Promise<void> {
  const recipient = await getInvitationRecipient(invitationId);
  if (!recipient) return;
  void emitWebhookEventSafely({ workspaceId: recipient.workspaceId, type: "workspace.invitation_created", data: { invitationId } });
  await createNotificationSafely(
    {
      ...recipient,
      actorId,
      type: "INVITATION_RECEIVED",
      priority: "info",
      title: "Workspace invitation",
      message: "You have been invited to join a workspace.",
      resourceType: "invitation",
      resourceId: invitationId,
      href: "/team",
      metadata: { invitationId },
      dedupeKey: "invitation:" + invitationId,
    },
    { event: "invitation_received" },
  );
}

export async function notifyWorkspaceMemberEvent(
  workspaceId: string,
  memberId: string,
  type: "INVITATION_ACCEPTED" | "MEMBER_JOINED" | "MEMBER_LEFT",
  actorId?: string,
): Promise<void> {
  void emitWebhookEventSafely({ workspaceId, type: type === "MEMBER_LEFT" ? "workspace.member_removed" : type === "MEMBER_JOINED" ? "workspace.member_joined" : "workspace.invitation_accepted", data: { memberId } });
  const recipient = await getWorkspaceOwnerRecipient(workspaceId);
  if (!recipient || recipient.recipientId === memberId) return;
  const copy = type === "MEMBER_LEFT"
    ? { title: "Member left", message: "A workspace member left the workspace." }
    : type === "INVITATION_ACCEPTED"
      ? { title: "Invitation accepted", message: "A workspace invitation was accepted." }
      : { title: "Member joined", message: "A new member joined the workspace." };
  await createNotificationSafely(
    {
      ...recipient,
      actorId: type === "MEMBER_LEFT" ? undefined : actorId,
      type,
      priority: type === "INVITATION_ACCEPTED" ? "success" : "info",
      title: copy.title,
      message: copy.message,
      resourceType: "member",
      resourceId: memberId,
      href: "/team",
      metadata: { memberId },
    },
    { event: "workspace_member" },
  );
}

export async function notifyWorkspaceTransfer(
  workspaceId: string,
  oldOwnerId: string,
  newOwnerId: string,
): Promise<void> {
  void emitWebhookEventSafely({ workspaceId, type: "workspace.ownership_transferred", data: { memberId: newOwnerId } });
  await Promise.all(
    [oldOwnerId, newOwnerId].map((recipientId) =>
      createNotificationSafely(
        {
          workspaceId,
          recipientId,
          actorId: oldOwnerId,
          type: "WORKSPACE_TRANSFERRED",
          priority: "warning",
          title: "Workspace ownership transferred",
          message: recipientId === newOwnerId
            ? "You are now the owner of this workspace."
            : "Workspace ownership was transferred to another member.",
          resourceType: "workspace",
          resourceId: workspaceId,
          href: "/workspace/settings",
          metadata: { workspaceId, newOwnerId },
        },
        { event: "workspace_transfer" },
      ),
    ),
  );
}

export async function notifyWebhookOperationalEvent(
  workspaceId: string,
  webhookId: string,
  reason: "auto_disabled" | "delivery_failed" | "test_failed" | "secret_rotated",
): Promise<void> {
  const recipient = await getWorkspaceOwnerRecipient(workspaceId);
  if (!recipient) return;
  const copy = reason === "auto_disabled"
    ? { title: "Webhook disabled", message: "A webhook was disabled after repeated delivery failures.", priority: "error" as const, key: `webhook-disabled:${webhookId}` }
    : reason === "test_failed"
      ? { title: "Webhook test failed", message: "The webhook test could not be delivered. Review its delivery history.", priority: "warning" as const, key: `webhook-test-failed:${webhookId}` }
      : reason === "secret_rotated"
        ? { title: "Webhook secret rotated", message: "A webhook secret was rotated. Update the receiving service before the next delivery.", priority: "info" as const, key: `webhook-secret-rotated:${webhookId}:${Date.now()}` }
        : { title: "Webhook delivery failed", message: "A webhook delivery failed. Review its delivery history if this continues.", priority: "warning" as const, key: `webhook-delivery-failed:${webhookId}` };
  await createNotificationSafely({ workspaceId, recipientId: recipient.recipientId, type: "SYSTEM", priority: copy.priority, title: copy.title, message: copy.message, resourceType: "webhook", resourceId: webhookId, href: `/integrations/webhooks/${webhookId}`, metadata: { webhookId, reason }, dedupeKey: copy.key }, { event: "webhook_operational" });
}
