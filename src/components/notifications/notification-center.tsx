"use client";

import { CheckCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { NotificationList, type NotificationWire } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";

const labels: Record<NotificationType, string> = {
  POST_PUBLISHED: "Post published",
  POST_FAILED: "Post failed",
  POST_PARTIAL_FAILURE: "Partial failure",
  POST_SCHEDULED: "Post scheduled",
  POST_CANCELLED: "Post cancelled",
  POST_RETRYING: "Retrying",
  POST_RETRY_FAILED: "Retry failed",
  CONTENT_SUBMITTED_FOR_REVIEW: "Post ready for review",
  CONTENT_APPROVED: "Post approved",
  CONTENT_CHANGES_REQUESTED: "Changes requested",
  CONTENT_RESUBMITTED: "Post resubmitted",
  APPROVAL_INVALIDATED: "Approval invalidated",
  ACCOUNT_EXPIRED: "Account expired",
  ACCOUNT_RECONNECT_REQUIRED: "Reconnect required",
  ACCOUNT_DISCONNECTED: "Account disconnected",
  INVITATION_RECEIVED: "Invitation received",
  INVITATION_ACCEPTED: "Invitation accepted",
  MEMBER_JOINED: "Member joined",
  MEMBER_LEFT: "Member left",
  WORKSPACE_TRANSFERRED: "Workspace transferred",
  WORKSPACE_DELETED: "Workspace deleted",
  SYSTEM: "System",
};

export function NotificationCenter({
  initialNotifications,
  initialPagination,
  initialUnreadCount,
}: {
  initialNotifications: NotificationWire[];
  initialPagination: { page: number; limit: number; total: number; totalPages: number };
  initialUnreadCount: number;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [pagination, setPagination] = useState(initialPagination);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [type, setType] = useState<NotificationType | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(page = 1, nextType = type, nextUnreadOnly = unreadOnly) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (nextType) params.set("type", nextType);
      if (nextUnreadOnly) params.set("unreadOnly", "true");
      const response = await fetch("/api/notifications?" + params.toString(), { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { notifications: NotificationWire[]; pagination: typeof initialPagination; unreadCount: number };
      setNotifications(data.notifications);
      setPagination(data.pagination);
      setUnreadCount(data.unreadCount);
    } finally {
      setLoading(false);
    }
  }

  async function markAll() {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    if (response.ok) {
      setUnreadCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    }
  }

  async function deleteRead() {
    const response = await fetch("/api/notifications/read", { method: "DELETE" });
    if (response.ok) void load(pagination.page);
  }

  async function deleteOne(item: NotificationWire) {
    const response = await fetch("/api/notifications/" + item.id, { method: "DELETE" });
    if (response.ok) {
      setNotifications((current) => current.filter((notification) => notification.id !== item.id));
      if (!item.readAt) setUnreadCount((count) => Math.max(0, count - 1));
    }
  }

  return (
    <Card>
      <CardHeader className="gap-4 border-b border-border/60 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Notification history</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter notification type"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={type}
            onChange={(event) => {
              const next = event.target.value as NotificationType | "";
              setType(next);
              void load(1, next, unreadOnly);
            }}
          >
            <option value="">All types</option>
            {NOTIFICATION_TYPES.map((item) => <option key={item} value={item}>{labels[item]}</option>)}
          </select>
          <Button type="button" variant={unreadOnly ? "secondary" : "outline"} size="sm" onClick={() => { const next = !unreadOnly; setUnreadOnly(next); void load(1, type, next); }}>
            Unread only
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={unreadCount === 0} onClick={() => void markAll()}>
            <CheckCheck aria-hidden="true" /> Mark all read
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void deleteRead()}>
            <Trash2 aria-hidden="true" /> Clear read
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p> : <NotificationList notifications={notifications} onDelete={(item) => void deleteOne(item)} onRead={(item) => { if (!item.readAt) { setUnreadCount((count) => Math.max(0, count - 1)); setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification)); } }} />}
        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border/60 p-4 text-xs text-muted-foreground">
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pagination.page <= 1 || loading} onClick={() => void load(pagination.page - 1)}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => void load(pagination.page + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
