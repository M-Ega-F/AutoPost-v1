"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Info,
  KeyRound,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationPriority, NotificationType } from "@/lib/notifications/types";

export type NotificationWire = {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  href: string | null;
  metadata: Record<string, string | number | boolean | null>;
  readAt: string | Date | null;
  createdAt: string | Date;
};

const ICONS: Record<NotificationType, LucideIcon> = {
  POST_PUBLISHED: CheckCircle2,
  POST_FAILED: XCircle,
  POST_PARTIAL_FAILURE: AlertTriangle,
  POST_SCHEDULED: Bell,
  POST_CANCELLED: XCircle,
  POST_RETRYING: Bell,
  POST_RETRY_FAILED: XCircle,
  CONTENT_SUBMITTED_FOR_REVIEW: Bell,
  CONTENT_APPROVED: CheckCircle2,
  CONTENT_CHANGES_REQUESTED: AlertTriangle,
  CONTENT_RESUBMITTED: Bell,
  APPROVAL_INVALIDATED: AlertTriangle,
  REVIEWER_ASSIGNED: UserPlus,
  REVIEWER_CHANGED: Users,
  REVIEWER_UNASSIGNED: Users,
  REVIEW_WITHDRAWN: AlertTriangle,
  REVIEW_COMMENT_ADDED: Bell,
  REVIEW_DEADLINE_CHANGED: Bell,
  REVIEW_DEADLINE_APPROACHING: AlertTriangle,
  REVIEW_OVERDUE: AlertTriangle,
  REVIEW_ESCALATED: AlertTriangle,
  REVIEW_COMMENT_UPDATED: Bell,
  REVIEW_COMMENT_DELETED: Bell,
  REVIEW_COMMENT_RESOLVED: CheckCircle2,
  REVIEW_COMMENT_REOPENED: Bell,
  REVIEW_MENTIONED: Bell,
  CAMPAIGN_CREATED: BriefcaseBusiness,
  CAMPAIGN_UPDATED: BriefcaseBusiness,
  CAMPAIGN_GOAL_UPDATED: BriefcaseBusiness,
  CAMPAIGN_ACTIVATED: BriefcaseBusiness,
  CAMPAIGN_COMPLETED: CheckCircle2,
  CAMPAIGN_ARCHIVED: BriefcaseBusiness,
  CAMPAIGN_DELETED: AlertTriangle,
  CAMPAIGN_POST_ADDED: BriefcaseBusiness,
  CAMPAIGN_POST_REMOVED: BriefcaseBusiness,
  CAMPAIGN_GOAL_MILESTONE: BriefcaseBusiness,
  CAMPAIGN_GOAL_COMPLETED: BriefcaseBusiness,
  CAMPAIGN_HEALTH_WARNING: BriefcaseBusiness,
  CAMPAIGN_AT_RISK: BriefcaseBusiness,
  CAMPAIGN_CRITICAL: BriefcaseBusiness,
  CAMPAIGN_DEADLINE_WARNING: BriefcaseBusiness,
  CAMPAIGN_DEADLINE_OVERDUE: BriefcaseBusiness,
  CAMPAIGN_APPROVAL_BOTTLENECK: BriefcaseBusiness,
  CAMPAIGN_CONTENT_UNDERPERFORMING: BriefcaseBusiness,
  CAMPAIGN_RECOMMENDATION: BriefcaseBusiness,
  OPTIMIZATION_ACTION_CREATED: BriefcaseBusiness,
  OPTIMIZATION_ACTION_COMPLETED: CheckCircle2,
  EXPERIMENT_WINNER_DETECTED: CheckCircle2,
  EXPERIMENT_INSUFFICIENT_DATA: AlertTriangle,
  EXPERIMENT_STATISTICAL_MILESTONE: Activity,
  ACCOUNT_EXPIRED: KeyRound,
  ACCOUNT_RECONNECT_REQUIRED: KeyRound,
  ACCOUNT_DISCONNECTED: KeyRound,
  INVITATION_RECEIVED: UserPlus,
  INVITATION_ACCEPTED: CheckCircle2,
  MEMBER_JOINED: Users,
  MEMBER_LEFT: Users,
  WORKSPACE_TRANSFERRED: Users,
  WORKSPACE_DELETED: AlertTriangle,
  SYSTEM: Info,
};

const ICON_TONES: Record<NotificationPriority, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

function relativeTime(value: string | Date): string {
  const time = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d ago";
  return new Date(value).toLocaleDateString();
}

export function NotificationList({
  notifications,
  compact = false,
  onRead,
  onDelete,
}: {
  notifications: NotificationWire[];
  compact?: boolean;
  onRead?: (notification: NotificationWire) => void;
  onDelete?: (notification: NotificationWire) => void;
}) {
  const router = useRouter();
  if (notifications.length === 0) {
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>;
  }

  return (
    <div className={cn("divide-y divide-border/60", compact && "max-h-96 overflow-y-auto")}>
      {notifications.map((notification) => {
        const Icon = ICONS[notification.type] ?? Info;
        return (
          <div key={notification.id} className={cn("group flex gap-3 p-3", !notification.readAt && "bg-primary/5")}>
            <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_TONES[notification.priority])} aria-hidden="true" />
            <button
              type="button"
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                if (!notification.readAt) void fetch("/api/notifications/" + notification.id + "/read", { method: "POST" }).catch(() => undefined);
                onRead?.(notification);
                if (notification.href?.startsWith("/") && !notification.href.startsWith("//")) router.push(notification.href);
              }}
            >
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{notification.title}</span>
                {!notification.readAt ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{notification.message}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(notification.createdAt)}</span>
            </button>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={"Delete " + notification.title}
                onClick={() => onDelete(notification)}
              >
                <XCircle aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
