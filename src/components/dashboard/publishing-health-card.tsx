"use client";

import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthStatus, ReliabilityJob, ReliabilitySnapshot } from "@/lib/reliability/health";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 30_000;

function statusCopy(status: HealthStatus): { label: string; variant: "success" | "warning" | "danger"; icon: typeof CheckCircle2 } {
  if (status === "healthy") return { label: "All clear", variant: "success", icon: CheckCircle2 };
  if (status === "degraded") return { label: "Needs attention", variant: "warning", icon: AlertTriangle };
  return { label: "Unavailable", variant: "danger", icon: WifiOff };
}

function count(value: number | null): string {
  return value === null ? "—" : String(value);
}

function platformName(platform: string | null): string {
  if (!platform) return "This platform";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function jobCopy(job: ReliabilityJob): string {
  if (job.kind === "failed") return job.finalFailure ? "Could not be published" : "Will be tried again";
  return "Taking longer than expected";
}

function HealthMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/35 px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function PublishingHealthCard({ initialSnapshot }: { initialSnapshot: ReliabilitySnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const currentStatus = statusCopy(snapshot.overall);
  const StatusIcon = currentStatus.icon;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setIsRefreshing(true);
      try {
        const response = await fetch("/api/workspace/reliability", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { reliability?: ReliabilitySnapshot };
        if (!cancelled && body.reliability) setSnapshot(body.reliability);
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const waiting = (snapshot.queues.publishing.counts.waiting ?? 0) + (snapshot.queues.analytics.counts.waiting ?? 0) + (snapshot.queues.webhooks.counts.waiting ?? 0);
  const active = (snapshot.queues.publishing.counts.active ?? 0) + (snapshot.queues.analytics.counts.active ?? 0) + (snapshot.queues.webhooks.counts.active ?? 0);
  const delayed = (snapshot.queues.publishing.counts.delayed ?? 0) + (snapshot.queues.analytics.counts.delayed ?? 0) + (snapshot.queues.webhooks.counts.delayed ?? 0);

  return (
    <Card aria-labelledby="publishing-health-title" className="gap-4">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle id="publishing-health-title" className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-neon-cyan" aria-hidden="true" />
              Publishing health
            </CardTitle>
            <CardDescription className="mt-1">Live activity from your publishing service.</CardDescription>
          </div>
          <Badge variant={currentStatus.variant}>
            <StatusIcon aria-hidden="true" />
            {currentStatus.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {snapshot.overall === "offline" ? (
          <Alert variant="warning">
            <WifiOff aria-hidden="true" />
            <AlertTitle>Publishing health is unavailable.</AlertTitle>
            <AlertDescription>Publishing can resume when the service connection is restored.</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-4">
          <HealthMetric label="Waiting" value={count(waiting)} icon={Clock3} />
          <HealthMetric label="Publishing" value={count(active)} icon={Loader2} />
          <HealthMetric label="Needs attention" value={String(snapshot.attention.failedCount + snapshot.attention.stuckCount)} icon={AlertTriangle} />
          <HealthMetric label="Deferred" value={count(delayed)} icon={RefreshCw} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2" aria-live="polite">
            <span className={cn("size-2 rounded-full", snapshot.worker.status === "healthy" ? "bg-success" : "bg-warning")} aria-hidden="true" />
            Publishing service: {snapshot.worker.status === "healthy" ? "Running" : snapshot.worker.status === "degraded" ? "Delayed" : "Unavailable"}
          </span>
          <span>Updated {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(snapshot.checkedAt))}</span>
        </div>

        {snapshot.jobs.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Items needing attention</h3>
            <ul className="space-y-2" aria-live="polite">
              {snapshot.jobs.slice(0, 5).map((job, index) => (
                <li key={`${job.queue}-${job.kind}-${job.occurredAt}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{platformName(job.platform)} · {jobCopy(job)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{job.attemptsMade}/{job.maxAttempts} tries</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" disabled={isRefreshing} onClick={() => window.location.reload()}>
            <RefreshCw className={cn(isRefreshing && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
