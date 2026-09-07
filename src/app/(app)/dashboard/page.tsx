import { SquarePen } from "lucide-react";
import Link from "next/link";

import { ConnectedAccountsSummary } from "@/components/dashboard/connected-accounts-summary";
import { DashboardPolling } from "@/components/dashboard/dashboard-polling";
import { DashboardQuickActions } from "@/components/dashboard/dashboard-quick-actions";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { FailedPostsCard } from "@/components/dashboard/failed-posts-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { ReconnectBanner } from "@/components/dashboard/reconnect-banner";
import { UpcomingPostsCard } from "@/components/dashboard/upcoming-posts-card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { getDashboardService } from "@/lib/services/dashboard";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const data = await getDashboardService(userId);

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
        <section aria-labelledby="dashboard-welcome-title" className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/70 to-neon-cyan/5 p-5 shadow-[0_0_30px_hsl(var(--primary)/0.10)] md:p-6">
          <p className="text-sm font-medium text-primary">Good morning 👋</p>
          <h2 id="dashboard-welcome-title" className="mt-1 text-xl font-semibold tracking-tight">
            Keep your publishing flow moving.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            See what is scheduled, what is publishing, and where an account needs your attention.
          </p>
        </section>

        <DashboardQuickActions />
        <DashboardStats stats={data.stats} />

        <ReconnectBanner
          accounts={data.connectedAccounts.filter(
            (account) => account.status === "needs_reconnect",
          )}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <UpcomingPostsCard posts={data.upcoming} />
          <RecentActivityCard posts={data.recent} />
        </div>

        <FailedPostsCard items={data.failedTargets} />
        <ConnectedAccountsSummary accounts={data.connectedAccounts} />
        </div>
      </DashboardPolling>
    </>
  );
}
