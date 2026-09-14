"use client";

import { Bell, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { NotificationList, type NotificationWire } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export function NotificationBell({ activeWorkspaceId }: { activeWorkspaceId: string }) {
  const [notifications, setNotifications] = useState<NotificationWire[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { notifications?: NotificationWire[]; unreadCount?: number };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("notification:refresh", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("notification:refresh", refresh);
    };
  }, [activeWorkspaceId]);

  async function markAll() {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    if (response.ok) {
      setUnreadCount(0);
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative" aria-label={unreadCount > 0 ? unreadCount + " unread notifications" : "Notifications"}>
          <Bell aria-hidden="true" />
          {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <PopoverHeader className="flex-row items-center justify-between border-b border-border/60 px-4 py-3">
          <PopoverTitle>Notifications</PopoverTitle>
          <Button type="button" variant="ghost" size="xs" disabled={unreadCount === 0} onClick={() => void markAll()}>Mark all read</Button>
        </PopoverHeader>
        {loading ? <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p> : <NotificationList notifications={notifications} compact onRead={(notification) => { if (!notification.readAt) setUnreadCount((count) => Math.max(0, count - 1)); }} />}
        <div className="border-t border-border/60 p-2">
          <Button type="button" variant="ghost" className="w-full justify-center" onClick={() => router.push("/notifications")}>
            View all notifications <ExternalLink aria-hidden="true" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
