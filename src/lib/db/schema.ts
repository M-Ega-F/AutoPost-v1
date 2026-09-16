import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  type AnyPgColumn,
  index,
  integer,
  numeric,
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

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "completed",
  "archived",
]);

export const campaignObjectiveEnum = pgEnum("campaign_objective", [
  "brand_awareness",
  "engagement",
  "traffic",
  "promotion",
  "education",
  "community",
  "other",
]);

export const campaignTargetMetricEnum = pgEnum("campaign_target_metric", [
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "reach",
  "impressions",
]);

export const campaignActivityTypeEnum = pgEnum("campaign_activity_type", [
  "created",
  "updated",
  "goal_updated",
  "activated",
  "completed",
  "archived",
  "restored",
  "post_added",
  "post_removed",
  "post_approved",
  "post_published",
  "post_failed",
  "goal_milestone",
  "goal_completed",
  "health_changed",
  "deadline_warning",
  "deadline_overdue",
  "publishing_issue",
  "approval_bottleneck",
  "intelligence_updated",
  "content_underperforming",
  "recommendation_created",
]);

export const campaignAutomationEventTypeEnum = pgEnum("campaign_automation_event_type", [
  "goal_milestone",
  "goal_completed",
  "health_changed",
  "deadline_warning",
  "deadline_overdue",
  "publishing_issue",
  "approval_bottleneck",
  "intelligence_updated",
  "content_underperforming",
  "recommendation_created",
]);

export const postReviewActionEnum = pgEnum("post_review_action", [
  "submitted",
  "approved",
  "changes_requested",
  "resubmitted",
  "invalidated",
  "reviewer_assigned",
  "reviewer_changed",
  "reviewer_unassigned",
  "deadline_changed",
  "withdrawn",
  "comment_added",
  "comment_updated",
  "comment_deleted",
  "comment_resolved",
  "comment_reopened",
  "deadline_approaching",
  "reminder_sent",
  "overdue",
  "escalated",
  "mentioned",
]);

export const postReviewAutomationEventTypeEnum = pgEnum("post_review_automation_event_type", [
  "deadline_approaching_24h",
  "deadline_approaching_6h",
  "overdue",
  "escalated",
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
  "REVIEWER_ASSIGNED",
  "REVIEWER_CHANGED",
  "REVIEWER_UNASSIGNED",
  "REVIEW_WITHDRAWN",
  "REVIEW_COMMENT_ADDED",
  "REVIEW_DEADLINE_CHANGED",
  "REVIEW_DEADLINE_APPROACHING",
  "REVIEW_OVERDUE",
  "REVIEW_ESCALATED",
  "REVIEW_COMMENT_UPDATED",
  "REVIEW_COMMENT_DELETED",
  "REVIEW_COMMENT_RESOLVED",
  "REVIEW_COMMENT_REOPENED",
  "REVIEW_MENTIONED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_UPDATED",
  "CAMPAIGN_GOAL_UPDATED",
  "CAMPAIGN_ACTIVATED",
  "CAMPAIGN_COMPLETED",
  "CAMPAIGN_ARCHIVED",
  "CAMPAIGN_DELETED",
  "CAMPAIGN_POST_ADDED",
  "CAMPAIGN_POST_REMOVED",
  "CAMPAIGN_GOAL_MILESTONE",
  "CAMPAIGN_GOAL_COMPLETED",
  "CAMPAIGN_HEALTH_WARNING",
  "CAMPAIGN_AT_RISK",
  "CAMPAIGN_CRITICAL",
  "CAMPAIGN_DEADLINE_WARNING",
  "CAMPAIGN_DEADLINE_OVERDUE",
  "CAMPAIGN_APPROVAL_BOTTLENECK",
  "CAMPAIGN_CONTENT_UNDERPERFORMING",
  "CAMPAIGN_RECOMMENDATION",
  "OPTIMIZATION_ACTION_CREATED",
  "OPTIMIZATION_ACTION_COMPLETED",
  "EXPERIMENT_WINNER_DETECTED",
  "EXPERIMENT_INSUFFICIENT_DATA",
  "EXPERIMENT_STATISTICAL_MILESTONE",
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
  "post.review_withdrawn",
  "post.reviewer_assigned",
  "post.reviewer_changed",
  "post.reviewer_unassigned",
  "post.review_deadline_changed",
  "post.review_comment_added",
  "post.review_deadline_approaching",
  "post.review_reminder_sent",
  "post.review_overdue",
  "post.review_escalated",
  "post.review_comment_updated",
  "post.review_comment_deleted",
  "post.review_comment_resolved",
  "post.review_comment_reopened",
  "post.review_mentioned",
  "campaign.created",
  "campaign.updated",
  "campaign.goal_updated",
  "campaign.activated",
  "campaign.completed",
  "campaign.archived",
  "campaign.deleted",
  "campaign.post_added",
  "campaign.post_removed",
  "campaign.goal_milestone",
  "campaign.goal_completed",
  "campaign.health_changed",
  "campaign.deadline_warning",
  "campaign.deadline_overdue",
  "campaign.performance_updated",
  "campaign.intelligence_updated",
  "campaign.content_underperforming",
  "campaign.recommendation_created",
  "optimization.action_created",
  "optimization.action_completed",
  "experiment.created",
  "experiment.started",
  "experiment.paused",
  "experiment.completed",
  "experiment.cancelled",
  "experiment.winner_detected",
  "experiment.insufficient_data",
  "experiment.statistical_milestone",
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

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: campaignStatusEnum("status").notNull().default("draft"),
    objective: campaignObjectiveEnum("objective"),
    customObjective: text("custom_objective"),
    targetMetric: campaignTargetMetricEnum("target_metric"),
    targetValue: bigint("target_value", { mode: "number" }),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("campaigns_workspace_id_index").on(t.workspaceId),
    index("campaigns_workspace_status_index").on(t.workspaceId, t.status),
    index("campaigns_workspace_updated_at_index").on(t.workspaceId, t.updatedAt),
    check("campaigns_name_length_check", sql`char_length(${t.name}) between 1 and 160`),
    check(
      "campaigns_date_range_check",
      sql`${t.startAt} is null or ${t.endAt} is null or ${t.startAt} <= ${t.endAt}`,
    ),
    check(
      "campaigns_target_value_check",
      sql`${t.targetValue} is null or ${t.targetValue} > 0`,
    ),
    check(
      "campaigns_custom_objective_check",
      sql`${t.objective} <> 'other' or char_length(trim(coalesce(${t.customObjective}, ''))) between 1 and 160`,
    ),
  ],
);

export const campaignActivity = pgTable(
  "campaign_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
    type: campaignActivityTypeEnum("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text("dedupe_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("campaign_activity_campaign_occurred_at_index").on(t.campaignId, t.occurredAt),
    index("campaign_activity_workspace_occurred_at_index").on(t.workspaceId, t.occurredAt),
    uniqueIndex("campaign_activity_campaign_dedupe_unique")
      .on(t.campaignId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);

export const campaignAutomationEvents = pgTable(
  "campaign_automation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    eventType: campaignAutomationEventTypeEnum("event_type").notNull(),
    eventKey: text("event_key").notNull(),
    state: text("state").notNull(),
    milestone: integer("milestone"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("campaign_automation_events_workspace_key_unique").on(t.workspaceId, t.eventKey),
    index("campaign_automation_events_campaign_created_at_index").on(t.campaignId, t.createdAt),
    index("campaign_automation_events_workspace_created_at_index").on(t.workspaceId, t.createdAt),
    check("campaign_automation_events_event_key_length_check", sql`char_length(${t.eventKey}) between 1 and 240`),
  ],
);

export const campaignIntelligenceSnapshots = pgTable(
  "campaign_intelligence_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    evaluationVersion: text("evaluation_version").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    evaluationMode: text("evaluation_mode").notNull(),
    snapshotReason: text("snapshot_reason").notNull(),
    performanceScore: integer("performance_score"),
    healthStatus: text("health_status"),
    momentum: text("momentum").notNull(),
    historicalTrend: text("historical_trend").notNull(),
    freshness: text("freshness").notNull(),
    confidence: text("confidence").notNull(),
    coverage: integer("coverage").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    evaluatedPostCount: integer("evaluated_post_count").notNull().default(0),
    topPerformerCount: integer("top_performer_count").notNull().default(0),
    underperformingCount: integer("underperforming_count").notNull().default(0),
    risingCount: integer("rising_count").notNull().default(0),
    decliningCount: integer("declining_count").notNull().default(0),
    goalProgress: integer("goal_progress"),
    insights: jsonb("insights").$type<Array<Record<string, unknown>>>().notNull().default([]),
    recommendations: jsonb("recommendations").$type<Array<Record<string, unknown>>>().notNull().default([]),
    opportunities: jsonb("opportunities").$type<Array<Record<string, unknown>>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("campaign_intelligence_snapshots_campaign_fingerprint_unique").on(t.workspaceId, t.campaignId, t.inputFingerprint),
    index("campaign_intelligence_snapshots_workspace_campaign_created_at_index").on(t.workspaceId, t.campaignId, t.createdAt),
    index("campaign_intelligence_snapshots_campaign_fingerprint_index").on(t.campaignId, t.inputFingerprint),
    check("campaign_intelligence_snapshots_coverage_check", sql`${t.coverage} between 0 and 100`),
    check("campaign_intelligence_snapshots_score_check", sql`${t.performanceScore} is null or ${t.performanceScore} between 0 and 100`),
    check("campaign_intelligence_snapshots_counts_check", sql`${t.postCount} >= 0 and ${t.evaluatedPostCount} >= 0 and ${t.topPerformerCount} >= 0 and ${t.underperformingCount} >= 0 and ${t.risingCount} >= 0 and ${t.decliningCount} >= 0`),
  ],
);

export const postIntelligenceSummaries = pgTable(
  "post_intelligence_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    performanceScore: integer("performance_score"),
    engagementScore: integer("engagement_score"),
    reachScore: integer("reach_score"),
    viewsScore: integer("views_score"),
    goalContribution: integer("goal_contribution"),
    trend: text("trend").notNull(),
    momentum: text("momentum").notNull(),
    classification: text("classification").notNull(),
    confidence: text("confidence").notNull(),
    freshness: text("freshness").notNull(),
    state: text("state").notNull().default("fresh"),
    isUnderperforming: boolean("is_underperforming").notNull().default(false),
    analyticsCoverage: integer("analytics_coverage").notNull().default(0),
    sampleSize: integer("sample_size").notNull().default(0),
    inputFingerprint: text("input_fingerprint").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("post_intelligence_summaries_workspace_campaign_post_unique").on(t.workspaceId, t.campaignId, t.postId),
    index("post_intelligence_summaries_campaign_perf_index").on(t.workspaceId, t.campaignId, t.performanceScore, t.postId),
    index("post_intelligence_summaries_campaign_engagement_index").on(t.workspaceId, t.campaignId, t.engagementScore, t.postId),
    index("post_intelligence_summaries_campaign_reach_index").on(t.workspaceId, t.campaignId, t.reachScore, t.postId),
    index("post_intelligence_summaries_campaign_views_index").on(t.workspaceId, t.campaignId, t.viewsScore, t.postId),
    index("post_intelligence_summaries_campaign_state_index").on(t.workspaceId, t.campaignId, t.state, t.updatedAt),
    index("post_intelligence_summaries_campaign_trend_index").on(t.workspaceId, t.campaignId, t.trend, t.postId),
    index("post_intelligence_summaries_campaign_underperforming_index").on(t.workspaceId, t.campaignId, t.isUnderperforming, t.postId),
    check("post_intelligence_summaries_score_check", sql`(${t.performanceScore} is null or ${t.performanceScore} between 0 and 100) and (${t.engagementScore} is null or ${t.engagementScore} between 0 and 100) and (${t.reachScore} is null or ${t.reachScore} between 0 and 100) and (${t.viewsScore} is null or ${t.viewsScore} between 0 and 100) and (${t.goalContribution} is null or ${t.goalContribution} between 0 and 100)`),
    check("post_intelligence_summaries_quality_check", sql`${t.analyticsCoverage} between 0 and 100 and ${t.sampleSize} >= 0`),
    check("post_intelligence_summaries_state_check", sql`${t.state} in ('fresh', 'stale', 'evaluating', 'failed')`),
  ],
);

export const campaignOptimizationActions = pgTable(
  "campaign_optimization_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    sourceSnapshotId: uuid("source_snapshot_id").references(() => campaignIntelligenceSnapshots.id, { onDelete: "set null" }),
    sourceFingerprint: text("source_fingerprint"),
    title: text("title").notNull(),
    description: text("description"),
    actionType: text("action_type").notNull(),
    status: text("status").notNull().default("proposed"),
    createdBy: uuid("created_by").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
    assignedTo: uuid("assigned_to").references(() => authUsers.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("opt_actions_workspace_campaign_status_index").on(t.workspaceId, t.campaignId, t.status, t.createdAt),
    index("opt_actions_campaign_created_at_index").on(t.campaignId, t.createdAt),
    index("opt_actions_source_snapshot_index").on(t.sourceSnapshotId),
    unique("opt_actions_source_fingerprint_unique").on(t.workspaceId, t.campaignId, t.sourceFingerprint),
    check("opt_actions_title_length_check", sql`char_length(${t.title}) between 1 and 160`),
    check("opt_actions_type_check", sql`${t.actionType} in ('create_variant', 'change_format', 'change_platform', 'change_posting_time', 'test_hook', 'test_caption')`),
    check("opt_actions_status_check", sql`${t.status} in ('proposed', 'accepted', 'in_progress', 'completed', 'dismissed', 'cancelled', 'failed')`),
  ],
);

export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    optimizationActionId: uuid("optimization_action_id").references(() => campaignOptimizationActions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    experimentType: text("experiment_type").notNull().default("content"),
    primaryMetric: campaignTargetMetricEnum("primary_metric").notNull(),
    status: text("status").notNull().default("draft"),
    controlPostId: uuid("control_post_id").notNull().references(() => posts.id, { onDelete: "restrict" }),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    winnerVariantId: uuid("winner_variant_id"),
    confidence: text("confidence"),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("experiments_workspace_campaign_name_unique").on(t.workspaceId, t.campaignId, t.name),
    index("experiments_workspace_campaign_status_index").on(t.workspaceId, t.campaignId, t.status, t.createdAt),
    index("experiments_campaign_metric_status_index").on(t.campaignId, t.primaryMetric, t.status),
    index("experiments_control_post_index").on(t.controlPostId),
    check("experiments_name_length_check", sql`char_length(${t.name}) between 1 and 160`),
    check("experiments_type_check", sql`${t.experimentType} in ('content', 'format', 'platform', 'posting_time', 'hook', 'caption')`),
    check("experiments_status_check", sql`${t.status} in ('draft', 'planned', 'running', 'paused', 'completed', 'cancelled')`),
    check("experiments_confidence_check", sql`${t.confidence} is null or ${t.confidence} in ('high', 'medium', 'low', 'insufficient')`),
  ],
);

export const experimentVariants = pgTable(
  "experiment_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    variantType: text("variant_type").notNull().default("content"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("experiment_variants_experiment_label_unique").on(t.experimentId, t.label),
    unique("experiment_variants_experiment_post_unique").on(t.experimentId, t.postId),
    index("experiment_variants_workspace_experiment_index").on(t.workspaceId, t.experimentId, t.createdAt),
    index("experiment_variants_post_index").on(t.postId),
    check("experiment_variants_label_length_check", sql`char_length(${t.label}) between 1 and 80`),
    check("experiment_variants_type_check", sql`${t.variantType} in ('content', 'format', 'platform', 'posting_time', 'hook', 'caption')`),
  ],
);

export const experimentResultSnapshots = pgTable(
  "experiment_result_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    experimentId: uuid("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
    algorithmVersion: text("algorithm_version").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    status: text("status").notNull(),
    controlValue: integer("control_value"),
    variantValues: jsonb("variant_values").$type<Record<string, number | null>>().notNull().default({}),
    controlSampleSize: integer("control_sample_size").notNull().default(0),
    variantSampleSizes: jsonb("variant_sample_sizes").$type<Record<string, number>>().notNull().default({}),
    confidence: text("confidence").notNull(),
    winnerVariantId: uuid("winner_variant_id"),
    statisticalStatus: text("statistical_status").notNull().default("insufficient_data"),
    sampleSize: integer("sample_size").notNull().default(0),
    controlMetric: numeric("control_metric", { precision: 12, scale: 6, mode: "number" }),
    variantMetrics: jsonb("variant_metrics").$type<Record<string, number | null>>().notNull().default({}),
    absoluteUplifts: jsonb("absolute_uplifts").$type<Record<string, number | null>>().notNull().default({}),
    relativeUplifts: jsonb("relative_uplifts").$type<Record<string, number | null>>().notNull().default({}),
    confidenceLevel: numeric("confidence_level", { precision: 5, scale: 4, mode: "number" }),
    confidenceIntervals: jsonb("confidence_intervals").$type<Record<string, { estimate: number; lowerBound: number; upperBound: number } | null>>().notNull().default({}),
    mdeAbsolute: numeric("mde_absolute", { precision: 12, scale: 6, mode: "number" }),
    mdeRelative: numeric("mde_relative", { precision: 12, scale: 6, mode: "number" }),
    powerEstimate: numeric("power_estimate", { precision: 5, scale: 4, mode: "number" }),
    targetPower: numeric("target_power", { precision: 5, scale: 4, mode: "number" }),
    winnerConfidence: numeric("winner_confidence", { precision: 5, scale: 4, mode: "number" }),
    durationHours: integer("duration_hours").notNull().default(0),
    dataQuality: text("data_quality").notNull().default("insufficient"),
    recommendation: text("recommendation").notNull().default("continue_experiment"),
    statisticalDetails: jsonb("statistical_details").$type<Record<string, unknown>>().notNull().default({}),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("experiment_results_experiment_fingerprint_unique").on(t.workspaceId, t.experimentId, t.inputFingerprint),
    index("experiment_results_workspace_experiment_created_at_index").on(t.workspaceId, t.experimentId, t.createdAt),
    index("experiment_results_experiment_status_index").on(t.experimentId, t.status, t.evaluatedAt),
    check("experiment_results_status_check", sql`${t.status} in ('variant_wins', 'control_wins', 'inconclusive', 'insufficient_data', 'failed')`),
    check("experiment_results_confidence_check", sql`${t.confidence} in ('high', 'medium', 'low', 'insufficient')`),
    check("experiment_results_statistical_status_check", sql`${t.statisticalStatus} in ('invalid', 'insufficient_data', 'running', 'inconclusive', 'statistically_promising', 'statistically_significant', 'winner', 'completed')`),
    check("experiment_results_sample_size_check", sql`${t.controlSampleSize} >= 0`),
    check("experiment_results_duration_check", sql`${t.durationHours} >= 0`),
  ],
);

export const experimentLearnings = pgTable(
  "experiment_learnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    experimentId: uuid("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
    platform: text("platform"),
    optimizationDimension: text("optimization_dimension").notNull(),
    metric: text("metric").notNull(),
    observedUplift: numeric("observed_uplift", { precision: 12, scale: 6, mode: "number" }),
    confidence: numeric("confidence", { precision: 5, scale: 4, mode: "number" }),
    sampleSize: integer("sample_size").notNull().default(0),
    durationDays: numeric("duration_days", { precision: 10, scale: 4, mode: "number" }),
    result: text("result").notNull(),
    learningStrength: text("learning_strength").notNull(),
    evidenceCount: integer("evidence_count").notNull().default(1),
    consistency: numeric("consistency", { precision: 5, scale: 4, mode: "number" }),
    algorithmVersion: text("algorithm_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("experiment_learnings_experiment_platform_unique").on(t.workspaceId, t.experimentId, t.platform),
    index("experiment_learnings_workspace_created_at_index").on(t.workspaceId, t.createdAt),
    index("experiment_learnings_workspace_platform_metric_index").on(t.workspaceId, t.platform, t.metric),
    index("experiment_learnings_workspace_result_index").on(t.workspaceId, t.result, t.createdAt),
    check("experiment_learnings_sample_size_check", sql`${t.sampleSize} >= 0`),
    check("experiment_learnings_evidence_count_check", sql`${t.evidenceCount} >= 1`),
    check("experiment_learnings_strength_check", sql`${t.learningStrength} in ('weak', 'moderate', 'strong')`),
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
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
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
    assignedReviewerId: uuid("assigned_reviewer_id").references(() => authUsers.id, { onDelete: "set null" }),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true, mode: "date" }),
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
    index("posts_workspace_campaign_id_index").on(t.workspaceId, t.campaignId),
    index("posts_campaign_id_index").on(t.campaignId),
    index("posts_status_index").on(t.status),
    index("posts_workspace_approval_queue_index").on(t.workspaceId, t.approvalStatus, t.reviewDueAt, t.updatedAt),
    index("posts_assigned_reviewer_index").on(t.assignedReviewerId, t.approvalStatus),
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

export const postReviewComments = pgTable(
  "post_review_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => authUsers.id, { onDelete: "set null" }),
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => postReviewComments.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    deletedBy: uuid("deleted_by").references(() => authUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedBy: uuid("resolved_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("post_review_comments_post_created_at_index").on(t.postId, t.createdAt),
    index("post_review_comments_workspace_created_at_index").on(t.workspaceId, t.createdAt),
    index("post_review_comments_author_index").on(t.authorId, t.createdAt),
    index("post_review_comments_parent_index").on(t.parentCommentId, t.createdAt),
    check("post_review_comments_body_length_check", sql`char_length(${t.body}) between 1 and 2000`),
  ],
);

export const postReviewCommentMentions = pgTable(
  "post_review_comment_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").notNull().references(() => postReviewComments.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("post_review_comment_mentions_comment_user_unique").on(t.commentId, t.mentionedUserId),
    index("post_review_comment_mentions_workspace_index").on(t.workspaceId, t.createdAt),
    index("post_review_comment_mentions_user_index").on(t.mentionedUserId, t.createdAt),
  ],
);

export const postReviewAutomationEvents = pgTable(
  "post_review_automation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => authUsers.id, { onDelete: "set null" }),
    eventType: postReviewAutomationEventTypeEnum("event_type").notNull(),
    eventKey: text("event_key").notNull(),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("post_review_automation_events_workspace_key_unique").on(t.workspaceId, t.eventKey),
    index("post_review_automation_events_post_created_at_index").on(t.postId, t.createdAt),
    index("post_review_automation_events_workspace_created_at_index").on(t.workspaceId, t.createdAt),
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
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignActivity = typeof campaignActivity.$inferSelect;
export type NewCampaignActivity = typeof campaignActivity.$inferInsert;
export type CampaignAutomationEvent = typeof campaignAutomationEvents.$inferSelect;
export type NewCampaignAutomationEvent = typeof campaignAutomationEvents.$inferInsert;
export type CampaignIntelligenceSnapshot = typeof campaignIntelligenceSnapshots.$inferSelect;
export type NewCampaignIntelligenceSnapshot = typeof campaignIntelligenceSnapshots.$inferInsert;
export type PostIntelligenceSummary = typeof postIntelligenceSummaries.$inferSelect;
export type NewPostIntelligenceSummary = typeof postIntelligenceSummaries.$inferInsert;
export type CampaignOptimizationAction = typeof campaignOptimizationActions.$inferSelect;
export type NewCampaignOptimizationAction = typeof campaignOptimizationActions.$inferInsert;
export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type NewExperimentVariant = typeof experimentVariants.$inferInsert;
export type ExperimentResultSnapshot = typeof experimentResultSnapshots.$inferSelect;
export type NewExperimentResultSnapshot = typeof experimentResultSnapshots.$inferInsert;
export type ExperimentLearning = typeof experimentLearnings.$inferSelect;
export type NewExperimentLearning = typeof experimentLearnings.$inferInsert;
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
