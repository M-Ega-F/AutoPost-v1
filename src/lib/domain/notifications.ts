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

async function getWorkspaceForNotifications(userId: string): Promise<{ workspaceId: string; role: Parameters<typeof hasPermission>[0] }> {
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
  const [rows, totalRows, unreadRows] = await Promise.all([
    db.select().from(notifications).where(and(...filters)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(...filters)),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.workspaceId, context.workspaceId), eq(notifications.recipientId, userId), isNull(notifications.readAt))),
  ]);
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
  const [post] = await db.select({ creatorId: posts.userId }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId))).limit(1);
  if (!post) return;

  let recipientIds: string[];
  if (type === "CONTENT_APPROVED" || type === "CONTENT_CHANGES_REQUESTED" || type === "APPROVAL_INVALIDATED") {
    recipientIds = [post.creatorId];
  } else {
    const reviewers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), sql`${workspaceMembers.role} in ('owner', 'admin')`));
    recipientIds = reviewers.map((row) => row.userId).filter((id) => id !== input.actorId);
  }

  await Promise.all(recipientIds.map((recipientId) => createNotificationSafely({ workspaceId: input.workspaceId, recipientId, actorId: input.actorId, type, priority: copy.priority, title: copy.title, message: input.comment?.trim() ? `${copy.message} ${input.comment.trim().slice(0, 350)}` : copy.message, resourceType: "post", resourceId: input.postId, href: `/history?post=${input.postId}`, metadata: { postId: input.postId, reviewEventId: input.eventId }, dedupeKey: `content-review:${input.eventId}:${recipientId}` }, { event: "content_review" })));
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
