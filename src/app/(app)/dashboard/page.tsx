import { SquarePen } from "lucide-react";
import Link from "next/link";

import { ConnectedAccountsSummary } from "@/components/dashboard/connected-accounts-summary";
import { DashboardPolling } from "@/components/dashboard/dashboard-polling";
import { DashboardQuickActions } from "@/components/dashboard/dashboard-quick-actions";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { DashboardPerformance } from "@/components/dashboard/dashboard-performance";
import { PublishingHealthCard } from "@/components/dashboard/publishing-health-card";
import { FailedPostsCard } from "@/components/dashboard/failed-posts-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { ReconnectBanner } from "@/components/dashboard/reconnect-banner";
import { UpcomingPostsCard } from "@/components/dashboard/upcoming-posts-card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { getActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { getReliabilitySnapshot } from "@/lib/reliability/health";
import { getDashboardService } from "@/lib/services/dashboard";
import { getSettingsForUser } from "@/lib/services/settings";
import { cookies } from "next/headers";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const [data, cookieStore, activeWorkspace] = await Promise.all([
    getDashboardService(userId),
    cookies(),
    getActiveWorkspaceForUser(userId),
  ]);
  const [reliability, settings] = await Promise.all([
    getReliabilitySnapshot(activeWorkspace.workspace.id),
    getSettingsForUser(
      userId,
      normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value),
    ),
  ]);

  // Only rows that are really in flight poll (Design 6.2): a scheduled post
  // waiting for its time has nothing to refresh.
  const isPublishing = [...data.upcoming, ...data.recent].some(
    (post) =>
      post.status === "processing" ||
      post.platforms.some((target) => target.status === "processing"),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Plan, publish, and monitor your social content from one place."
        action={
          <Button asChild>
            <Link href="/create-post">
              <SquarePen aria-hidden="true" />
              Create post
            </Link>
          </Button>
        }
      />

      <DashboardPolling enabled={isPublishing}>
        <div className="space-y-6">
        <section aria-labelledby="dashboard-welcome-title" className="rounded-xl border border-border bg-card p-5 md:p-6">
          <p className="text-sm font-medium text-primary">Good morning 👋</p>
          <h2 id="dashboard-welcome-title" className="mt-1 text-xl font-semibold tracking-tight">
            Keep your publishing flow moving.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            See what is scheduled, what is publishing, and where an account needs your attention.
          </p>
        </section>

        <DashboardStats stats={data.stats} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.85fr)]">
          <DashboardPerformance performance={data.performance} />
          <PublishingHealthCard initialSnapshot={reliability} />
        </div>

        <ReconnectBanner
          accounts={data.connectedAccounts.filter(
            (account) => account.status === "needs_reconnect",
          )}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <UpcomingPostsCard posts={data.upcoming} timeZone={settings.timezone} />
          <RecentActivityCard posts={data.recent} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <ConnectedAccountsSummary accounts={data.connectedAccounts} />
          <FailedPostsCard items={data.failedTargets} />
        </div>
        <DashboardQuickActions />
        </div>
      </DashboardPolling>
    </>
  );
}
