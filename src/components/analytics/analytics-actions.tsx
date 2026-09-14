"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useWorkspacePermission } from "@/components/auth/workspace-permissions";

export function AnalyticsRefreshButton() {
  const [loading, setLoading] = useState(false);
  const canRefresh = useWorkspacePermission("analytics:refresh");

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/analytics/refresh", { method: "POST" });
      if (!response.ok) throw new Error("refresh failed");
      toast.success("Analytics refresh queued.");
    } catch {
      toast.error("We couldn't refresh analytics. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!canRefresh) return null;
  return (
    <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
      <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden="true" />
      Refresh analytics
    </Button>
  );
}
