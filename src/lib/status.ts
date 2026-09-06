import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Facebook,
  FileText,
  Inbox,
  Instagram,
  Loader2,
  Music2,
  ThumbsUp,
  Unlink,
  Video,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
};

export type Platform = "instagram" | "facebook" | "tiktok";

export const PLATFORMS: readonly Platform[] = ["instagram", "facebook", "tiktok"];

export type PostStatus =
  | "draft"
  | "scheduled"
  | "processing"
  | "published"
  | "partial_failure"
  | "failed"
  | "cancelled";

export type PostPlatformStatus = "pending" | "processing" | "success" | "failed";

export type SocialAccountStatus = "active" | "needs_reconnect" | "disconnected";

export type ExecutionStatus = "accepted" | "processing" | "published" | "failed";

export type PlatformMeta = {
  label: string;
  icon: LucideIcon;
  tone: StatusTone;
};

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: { label: "Instagram", icon: Instagram, tone: "neutral" },
  facebook: { label: "Facebook", icon: Facebook, tone: "neutral" },
  tiktok: { label: "TikTok", icon: Music2, tone: "neutral" },
};

export const PLATFORM_FALLBACK_ICON: Record<Platform, LucideIcon> = {
  instagram: Camera,
  facebook: ThumbsUp,
  tiktok: Video,
};

export const POST_STATUS_META: Record<PostStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", icon: FileText },
  scheduled: { label: "Scheduled", tone: "info", icon: CalendarClock },
  processing: { label: "Processing", tone: "info", icon: Loader2 },
  published: { label: "Published", tone: "success", icon: CheckCircle2 },
  partial_failure: {
    label: "Partial failure",
    tone: "warning",
    icon: AlertTriangle,
  },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const PLATFORM_STATUS_META: Record<PostPlatformStatus, StatusMeta> = {
  pending: { label: "Pending", tone: "neutral", icon: Clock },
  processing: { label: "Processing", tone: "info", icon: Loader2 },
  success: { label: "Success", tone: "success", icon: Check },
  failed: { label: "Failed", tone: "danger", icon: X },
};

export const ACCOUNT_STATUS_META: Record<SocialAccountStatus, StatusMeta> = {
  active: { label: "Connected", tone: "success", icon: CheckCircle2 },
  needs_reconnect: {
    label: "Needs reconnect",
    tone: "warning",
    icon: AlertTriangle,
  },
  disconnected: { label: "Not connected", tone: "neutral", icon: Unlink },
};

export const EXECUTION_STATUS_META: Record<ExecutionStatus, StatusMeta> = {
  accepted: { label: "Accepted", tone: "neutral", icon: Inbox },
  processing: { label: "Processing", tone: "info", icon: Loader2 },
  published: { label: "Published", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
};

export function platformLabel(platform: string): string {
  return PLATFORM_META[platform as Platform]?.label ?? platform;
}

export function isPostStatus(value: unknown): value is PostStatus {
  return typeof value === "string" && value in POST_STATUS_META;
}

/**
 * Global post status, derived from the child platform statuses.
 * The UI never recomputes this — the stored `posts.status` is authoritative.
 */
export function derivePostStatus(
  platformStatuses: readonly PostPlatformStatus[],
  options: { scheduled: boolean } = { scheduled: false },
): PostStatus {
  if (platformStatuses.length === 0) {
    return options.scheduled ? "scheduled" : "failed";
  }

  const successCount = platformStatuses.filter((s) => s === "success").length;
  const failedCount = platformStatuses.filter((s) => s === "failed").length;
  const processingCount = platformStatuses.filter(
    (s) => s === "processing",
  ).length;
  const pendingCount = platformStatuses.filter((s) => s === "pending").length;

  if (failedCount > 0 && successCount > 0) return "partial_failure";
  if (failedCount === platformStatuses.length) return "failed";
  if (successCount === platformStatuses.length) return "published";
  if (processingCount > 0) return "processing";
  if (pendingCount > 0) return options.scheduled ? "scheduled" : "processing";

  return options.scheduled ? "scheduled" : "processing";
}

export function isTerminalPostStatus(status: PostStatus): boolean {
  return (
    status === "published" ||
    status === "partial_failure" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function isInFlightPostStatus(status: PostStatus): boolean {
  return status === "processing" || status === "scheduled";
}
