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
