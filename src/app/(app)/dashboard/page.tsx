import { SquarePen } from "lucide-react";
import Link from "next/link";

import { DashboardPolling } from "@/components/dashboard/dashboard-polling";
import { FailedPostsCard } from "@/components/dashboard/failed-posts-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { ReconnectBanner } from "@/components/dashboard/reconnect-banner";
import { UpcomingPostsCard } from "@/components/dashboard/upcoming-posts-card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { getDashboardData } from "@/lib/domain/posts";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const data = await getDashboardData(userId);

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
        <ReconnectBanner accounts={data.reconnectNeeded} />
        <UpcomingPostsCard posts={data.upcoming} />
        <RecentActivityCard posts={data.recent} />
        <FailedPostsCard items={data.failedTargets} />
      </DashboardPolling>
    </>
  );
}
