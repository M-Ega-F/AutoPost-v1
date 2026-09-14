export const NOTIFICATION_TYPES = [
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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["info", "success", "warning", "error"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export type NotificationMetadata = Record<string, string | number | boolean | null>;

export type NotificationItem = {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  href: string | null;
  metadata: NotificationMetadata;
  readAt: Date | null;
  createdAt: Date;
};

export const DEFAULT_NOTIFICATION_PRIORITY: Record<NotificationType, NotificationPriority> = {
  POST_PUBLISHED: "success",
  POST_FAILED: "error",
  POST_PARTIAL_FAILURE: "warning",
  POST_SCHEDULED: "info",
  POST_CANCELLED: "info",
  POST_RETRYING: "info",
  POST_RETRY_FAILED: "error",
  CONTENT_SUBMITTED_FOR_REVIEW: "info",
  CONTENT_APPROVED: "success",
  CONTENT_CHANGES_REQUESTED: "warning",
  CONTENT_RESUBMITTED: "info",
  APPROVAL_INVALIDATED: "warning",
  ACCOUNT_EXPIRED: "warning",
  ACCOUNT_RECONNECT_REQUIRED: "warning",
  ACCOUNT_DISCONNECTED: "warning",
  INVITATION_RECEIVED: "info",
  INVITATION_ACCEPTED: "success",
  MEMBER_JOINED: "info",
  MEMBER_LEFT: "info",
  WORKSPACE_TRANSFERRED: "warning",
  WORKSPACE_DELETED: "warning",
  SYSTEM: "info",
};
