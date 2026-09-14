import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardPerformance as PerformanceData } from "@/lib/domain/types";
import { PLATFORM_META } from "@/lib/status";

function metric(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function DashboardPerformance({ performance }: { performance: PerformanceData }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div><CardTitle>Performance</CardTitle><CardDescription>Latest available analytics from the last 30 days.</CardDescription></div>
        <Link href="/analytics" className="text-sm text-primary underline-offset-4 hover:underline">View analytics</Link>
      </CardHeader>
      <CardContent>
        {performance.available ? <div className="grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Views</p><p className="text-2xl font-semibold tabular-nums">{metric(performance.metrics.views)}</p></div><div><p className="text-sm text-muted-foreground">Engagement</p><p className="text-2xl font-semibold tabular-nums">{metric(performance.metrics.engagement)}</p></div><div><p className="text-sm text-muted-foreground">Top platform</p><p className="text-2xl font-semibold">{performance.topPlatform ? PLATFORM_META[performance.topPlatform].label : "—"}</p></div></div> : <p className="text-sm text-muted-foreground">No analytics data yet. Publish content to start tracking performance.</p>}
      </CardContent>
    </Card>
  );
}
