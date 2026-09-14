import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-schema";

export const platformEnum = pgEnum("platform", [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
  "linkedin",
  "x",
]);

export const socialAccountStatusEnum = pgEnum("social_account_status", [
  "active",
  "needs_reconnect",
  "disconnected",
]);

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "processing",
  "published",
  "partial_failure",
  "failed",
  "cancelled",
]);

export const postApprovalStatusEnum = pgEnum("post_approval_status", [
  "not_required",
  "draft",
  "in_review",
  "changes_requested",
  "approved",
]);

export const postReviewActionEnum = pgEnum("post_review_action", [
  "submitted",
  "approved",
  "changes_requested",
  "resubmitted",
  "invalidated",
]);

export const postPlatformStatusEnum = pgEnum("post_platform_status", [
  "pending",
  "processing",
  "success",
  "failed",
]);

export const executionStatusEnum = pgEnum("execution_status", [
  "accepted",
  "processing",
  "published",
  "failed",
]);

export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);

export const analyticsSnapshotStatusEnum = pgEnum("analytics_snapshot_status", [
  "available",
  "unavailable",
  "failed",
]);

export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const workspaceInvitationStatusEnum = pgEnum("workspace_invitation_status", [
  "pending",
  "accepted",
  "cancelled",
  "expired",
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "info",
  "success",
  "warning",
  "error",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "POST_PUBLISHED",
  "POST_FAILED",
  "POST_PARTIAL_FAILURE",
  "POST_SCHEDULED",
  "POST_CANCELLED",
  "POST_RETRYING",
  "POST_RETRY_FAILED",
  "CONTENT_SUBMITTED_FOR_REVIEW",
  "CONTENT_APPROVED",
  "CONTENT_CHANGES_REQUESTED",
  "CONTENT_RESUBMITTED",
  "APPROVAL_INVALIDATED",
  "ACCOUNT_EXPIRED",
  "ACCOUNT_RECONNECT_REQUIRED",
  "ACCOUNT_DISCONNECTED",
  "INVITATION_RECEIVED",
  "INVITATION_ACCEPTED",
  "MEMBER_JOINED",
  "MEMBER_LEFT",
  "WORKSPACE_TRANSFERRED",
  "WORKSPACE_DELETED",
  "SYSTEM",
]);

export const webhookEventTypeEnum = pgEnum("webhook_event_type", [
  "post.created",
  "post.scheduled",
  "post.publishing",
  "post.published",
  "post.failed",
  "post.partial_failure",
  "post.cancelled",
  "account.connected",
  "account.disconnected",
  "account.expired",
  "account.reconnect_required",
  "workspace.member_joined",
  "workspace.member_removed",
  "workspace.member_role_changed",
  "workspace.ownership_transferred",
  "workspace.invitation_created",
  "workspace.invitation_accepted",
  "workspace.invitation_cancelled",
  "analytics.updated",
  "post.review_requested",
  "post.approved",
  "post.changes_requested",
  "post.resubmitted",
  "post.approval_invalidated",
  "webhook.test",
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "processing",
  "delivered",
  "retrying",
  "failed",
  "cancelled",
]);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("UTC"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    isPersonal: boolean("is_personal").notNull().default(false),
    approvalRequired: boolean("approval_required").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("workspaces_slug_unique").on(t.slug),
    uniqueIndex("workspaces_owner_personal_unique")
      .on(t.ownerId)
      .where(sql`${t.isPersonal} = true`),
    index("workspaces_owner_id_index").on(t.ownerId),
    check("workspaces_slug_format_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: workspaceMemberRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("workspace_members_workspace_user_unique").on(t.workspaceId, t.userId),
    index("workspace_members_workspace_id_index").on(t.workspaceId),
    index("workspace_members_user_id_index").on(t.userId),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    role: workspaceMemberRoleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: workspaceInvitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("workspace_invitations_token_hash_unique").on(t.tokenHash),
    uniqueIndex("workspace_invitations_pending_email_unique")
      .on(t.workspaceId, t.normalizedEmail)
      .where(sql`${t.status} = 'pending'`),
    index("workspace_invitations_workspace_id_index").on(t.workspaceId),
    index("workspace_invitations_status_expires_at_index").on(t.status, t.expiresAt),
    check("workspace_invitations_role_not_owner_check", sql`${t.role} <> 'owner'`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
    type: notificationTypeEnum("type").notNull(),
    priority: notificationPriorityEnum("priority").notNull().default("info"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    href: text("href"),
    metadata: jsonb("metadata").notNull().default({}),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_recipient_workspace_created_at_index").on(
      t.recipientId,
      t.workspaceId,
      t.createdAt,
    ),
    index("notifications_workspace_created_at_index").on(t.workspaceId, t.createdAt),
    index("notifications_unread_index")
      .on(t.recipientId, t.workspaceId, t.createdAt)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notifications_unread_dedupe_unique")
      .on(t.workspaceId, t.recipientId, t.dedupeKey)
      .where(sql`${t.readAt} is null and ${t.dedupeKey} is not null`),
    check(
      "notifications_href_internal_check",
      sql`${t.href} is null or (${t.href} like '/%' and ${t.href} not like '//%')`,
    ),
  ],
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    failureCount: integer("failure_count").notNull().default(0),
    consecutiveFailureCount: integer("consecutive_failure_count").notNull().default(0),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true, mode: "date" }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true, mode: "date" }),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
    disabledReason: text("disabled_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("webhooks_workspace_active_index").on(t.workspaceId, t.isActive),
    index("webhooks_workspace_created_at_index").on(t.workspaceId, t.createdAt),
    check("webhooks_name_length_check", sql`char_length(${t.name}) between 1 and 120`),
    check("webhooks_url_length_check", sql`char_length(${t.url}) between 1 and 2048`),
  ],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventType: webhookEventTypeEnum("event_type").notNull(),
    eventId: uuid("event_id").notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    responseStatus: integer("response_status"),
    responseTimeMs: integer("response_time_ms"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    errorCode: text("error_code"),
    safeErrorMessage: text("safe_error_message"),
    responseBody: text("response_body"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("webhook_deliveries_webhook_event_unique").on(t.webhookId, t.eventId),
    index("webhook_deliveries_webhook_created_at_index").on(t.webhookId, t.createdAt),
    index("webhook_deliveries_workspace_status_created_at_index").on(t.workspaceId, t.status, t.createdAt),
    index("webhook_deliveries_event_id_index").on(t.eventId),
  ],
);

export type TemplateTarget = {
  platform: "instagram" | "facebook" | "tiktok" | "threads" | "linkedin" | "x";
  socialAccountId: string | null;
};

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformAccountId: text("platform_account_id").notNull(),
    username: text("username"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    scopes: text("scopes"),
    status: socialAccountStatusEnum("status").notNull().default("active"),
    lastValidatedAt: timestamp("last_validated_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("social_accounts_user_platform_account_unique").on(
      t.workspaceId,
      t.platform,
      t.platformAccountId,
    ),
    index("social_accounts_workspace_id_index").on(t.workspaceId),
    index("social_accounts_user_id_index").on(t.userId),
    index("social_accounts_user_id_platform_index").on(t.userId, t.platform),
    index("social_accounts_status_index").on(t.status),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentText: text("content_text").notNull(),
    timezone: text("timezone").notNull(),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: postStatusEnum("status").notNull().default("draft"),
    approvalStatus: postApprovalStatusEnum("approval_status").notNull().default("not_required"),
    reviewRequestedBy: uuid("review_requested_by").references(() => authUsers.id, { onDelete: "set null" }),
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true, mode: "date" }),
    approvedBy: uuid("approved_by").references(() => authUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    lastReviewComment: text("last_review_comment"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("posts_user_id_index").on(t.userId),
    index("posts_workspace_id_index").on(t.workspaceId),
    index("posts_status_index").on(t.status),
    index("posts_scheduled_at_index").on(t.scheduledAt),
    index("posts_status_scheduled_at_index").on(t.status, t.scheduledAt),
    index("posts_user_id_created_at_index").on(t.userId, t.createdAt),
  ],
);

export const postReviewEvents = pgTable(
  "post_review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    action: postReviewActionEnum("action").notNull(),
    actorId: uuid("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("post_review_events_post_created_at_index").on(t.postId, t.createdAt),
    index("post_review_events_workspace_created_at_index").on(t.workspaceId, t.createdAt),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key"),
    sourceUrl: text("source_url"),
    mediaType: mediaTypeEnum("media_type").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("post_media_post_id_index").on(t.postId),
    check(
      "post_media_source_present_check",
      sql`"storage_key" IS NOT NULL OR "source_url" IS NOT NULL`,
    ),
  ],
);

export const postPlatforms = pgTable(
  "post_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "restrict" }),
    platform: platformEnum("platform").notNull(),
    status: postPlatformStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextRetryAt: timestamp("next_retry_at", {
      withTimezone: true,
      mode: "date",
    }),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: text("locked_by"),
    bullmqJobId: text("bullmq_job_id"),
    externalPostId: text("external_post_id"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("post_platforms_post_account_unique").on(t.postId, t.socialAccountId),
    index("post_platforms_post_id_index").on(t.postId),
    index("post_platforms_status_index").on(t.status),
    index("post_platforms_status_next_retry_at_index").on(
      t.status,
      t.nextRetryAt,
    ),
  ],
);

export const postExecutions = pgTable(
  "post_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postPlatformId: uuid("post_platform_id")
      .notNull()
      .references(() => postPlatforms.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    status: executionStatusEnum("status").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    bullmqJobId: text("bullmq_job_id"),
    externalPostId: text("external_post_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    responseLog: jsonb("response_log"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("post_executions_platform_attempt_unique").on(
      t.postPlatformId,
      t.attemptNumber,
    ),
    index("post_executions_post_platform_id_index").on(t.postPlatformId),
    index("post_executions_status_index").on(t.status),
    index("post_executions_created_at_index").on(t.createdAt),
  ],
);

export const contentTemplates = pgTable(
  "content_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentText: text("content_text").notNull().default(""),
    mediaStorageKey: text("media_storage_key"),
    mediaSourceUrl: text("media_source_url"),
    mediaType: mediaTypeEnum("media_type"),
    mimeType: text("mime_type"),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    targets: jsonb("targets").$type<TemplateTarget[]>().notNull().default([]),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("content_templates_workspace_id_index").on(t.workspaceId),
    index("content_templates_user_id_index").on(t.userId),
    index("content_templates_user_id_updated_at_index").on(t.userId, t.updatedAt),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    timezone: text("timezone").notNull().default("UTC"),
    defaultScheduleTime: text("default_schedule_time")
      .notNull()
      .default("09:00"),
    activeWorkspaceId: uuid("active_workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("user_preferences_updated_at_index").on(t.updatedAt)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("media_assets_user_storage_unique").on(t.userId, t.storageKey),
    index("media_assets_workspace_id_index").on(t.workspaceId),
    index("media_assets_user_created_at_index").on(t.userId, t.createdAt),
    index("media_assets_user_media_type_index").on(t.userId, t.mediaType),
  ],
);

export const postAnalyticsSnapshots = pgTable(
  "post_analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    postPlatformId: uuid("post_platform_id")
      .notNull()
      .references(() => postPlatforms.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalPostId: text("external_post_id"),
    status: analyticsSnapshotStatusEnum("status").notNull(),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    saves: bigint("saves", { mode: "number" }),
    reach: bigint("reach", { mode: "number" }),
    impressions: bigint("impressions", { mode: "number" }),
    rawMetrics: jsonb("raw_metrics"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    collectedAt: timestamp("collected_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("post_analytics_snapshots_user_collected_at_index").on(
      t.userId,
      t.collectedAt,
    ),
    index("post_analytics_snapshots_post_platform_collected_at_index").on(
      t.postPlatformId,
      t.collectedAt,
    ),
    index("post_analytics_snapshots_user_platform_index").on(
      t.userId,
      t.platform,
    ),
  ],
);

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostReviewEvent = typeof postReviewEvents.$inferSelect;
export type NewPostReviewEvent = typeof postReviewEvents.$inferInsert;

export type PostMedia = typeof postMedia.$inferSelect;
export type NewPostMedia = typeof postMedia.$inferInsert;

export type PostPlatform = typeof postPlatforms.$inferSelect;
export type NewPostPlatform = typeof postPlatforms.$inferInsert;

export type PostExecution = typeof postExecutions.$inferSelect;
export type NewPostExecution = typeof postExecutions.$inferInsert;

export type ContentTemplate = typeof contentTemplates.$inferSelect;
export type NewContentTemplate = typeof contentTemplates.$inferInsert;

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type NewWorkspaceInvitation = typeof workspaceInvitations.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

export type PostAnalyticsSnapshot = typeof postAnalyticsSnapshots.$inferSelect;
export type NewPostAnalyticsSnapshot = typeof postAnalyticsSnapshots.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
