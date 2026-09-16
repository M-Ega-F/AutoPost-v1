export const WEBHOOK_EVENT_TYPES = [
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
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
export const WEBHOOK_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "delivered",
  "retrying",
  "failed",
  "cancelled",
] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export type WebhookEnvelope = {
  id: string;
  type: WebhookEventType;
  version: "2026-09-01";
  createdAt: string;
  workspace: { id: string; name: string };
  data: Record<string, unknown>;
};

export type WebhookPublic = {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  status: "healthy" | "degraded" | "failing" | "disabled";
  failureCount: number;
  consecutiveFailureCount: number;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryPublic = {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  eventId: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  responseStatus: number | null;
  responseTimeMs: number | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  safeErrorMessage: string | null;
  createdAt: string;
};
