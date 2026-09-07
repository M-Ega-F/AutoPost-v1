import { AlertTriangle, CalendarClock, CheckCircle2, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardStats as DashboardStatsData } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const STAT_ITEMS = [
  { key: "scheduled", label: "Scheduled", icon: CalendarClock, tone: "text-info" },
  { key: "publishing", label: "Publishing", icon: Loader2, tone: "text-primary" },
  { key: "published", label: "Published", icon: CheckCircle2, tone: "text-success" },
  { key: "failed", label: "Failed", icon: AlertTriangle, tone: "text-warning" },
] as const;

export function DashboardStats({ stats }: { stats: DashboardStatsData }) {
  return (
    <section aria-labelledby="dashboard-stats-title" className="space-y-3">
      <h2 id="dashboard-stats-title" className="text-sm font-medium text-muted-foreground">
        Post overview
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="gap-3 rounded-lg p-5">
              <CardContent className="flex items-center justify-between gap-4 p-0">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="text-3xl font-semibold tabular-nums">{stats[item.key]}</p>
                </div>
                <Icon
                  className={cn("size-6", item.tone, item.key === "publishing" && "animate-spin motion-reduce:animate-none")}
                  aria-hidden="true"
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
