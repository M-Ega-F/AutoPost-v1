import Link from "next/link";

import { AnalyticsRefreshButton } from "@/components/analytics/analytics-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth/server";
import { getAnalyticsForUser } from "@/lib/services/posts";
import { getSettingsForUser } from "@/lib/services/settings";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/status";
import { normalizeTimeZone } from "@/lib/time";

function metric(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function rangeValue(value: string | string[] | undefined): "7d" | "30d" | "all" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "7d" || raw === "all" ? raw : "30d";
}

function platformValue(value: string | string[] | undefined): Platform | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (PLATFORMS as readonly string[]).includes(raw) ? raw as Platform : undefined;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;
  const range = rangeValue(params.range);
  const platform = platformValue(params.platform);
  const settings = await getSettingsForUser(userId);
  const analytics = await getAnalyticsForUser(userId, {
    range,
    platform,
    timeZone: normalizeTimeZone(settings.timezone),
  });
  const hasData = analytics.platforms.some((item) => item.status === "available");

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Understand how your published content is performing."
        action={<AnalyticsRefreshButton />}
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Range</span>
            {(["7d", "30d", "all"] as const).map((value) => (
              <Button key={value} asChild size="sm" variant={range === value ? "secondary" : "ghost"}>
                <Link href={`/analytics?range=${value}${platform ? `&platform=${platform}` : ""}`}>
                  {value === "all" ? "All time" : `Last ${value.slice(0, -1)} days`}
                </Link>
              </Button>
            ))}
          </div>
          <form action="/analytics" method="get" className="flex items-center gap-2">
            <input type="hidden" name="range" value={range} />
            <label htmlFor="analytics-platform" className="sr-only">Platform filter</label>
            <select id="analytics-platform" defaultValue={platform ?? ""} className="h-9 rounded-md border border-input bg-background px-3 text-sm" name="platform">
                <option value="">All platforms</option>
                {PLATFORMS.map((value) => <option key={value} value={value}>{PLATFORM_META[value].label}</option>)}
            </select>
            <Button type="submit" size="sm" variant="ghost">Apply</Button>
          </form>
        </div>

        {!hasData && analytics.totalPublishedPosts === 0 ? (
          <Card>
            <CardHeader><CardTitle>No analytics yet</CardTitle><CardDescription>Publish content to start tracking performance.</CardDescription></CardHeader>
            <CardContent><Button asChild><Link href="/create-post">Create post</Link></Button></CardContent>
          </Card>
        ) : null}

        <section aria-labelledby="analytics-overview-title" className="space-y-3">
          <h2 id="analytics-overview-title" className="text-base font-medium">Overview</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Published posts", analytics.totalPublishedPosts.toString()],
              ["Views", metric(analytics.metrics.views)],
              ["Likes", metric(analytics.metrics.likes)],
              ["Comments", metric(analytics.metrics.comments)],
              ["Engagement", metric(analytics.metrics.engagement)],
            ].map(([label, value]) => (
              <Card key={label} className="gap-3 p-5"><CardContent className="p-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="analytics-platform-title" className="space-y-3">
          <h2 id="analytics-platform-title" className="text-base font-medium">Platform performance</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analytics.platforms.map((item) => {
              const meta = PLATFORM_META[item.platform];
              const Icon = meta.icon;
              return <Card key={item.platform} className="gap-3 p-5"><CardContent className="p-0"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4" aria-hidden="true" />{meta.label}</span><span className="text-xs text-muted-foreground">{item.status === "available" ? "Available" : item.status === "no_data" ? "No data yet" : "Unavailable"}</span></div>{item.status === "available" ? <p className="mt-3 text-sm text-muted-foreground">{metric(item.metrics.views)} views · {metric(item.metrics.engagement)} engagement</p> : <p className="mt-3 text-sm text-muted-foreground">Analytics are not available for this platform yet.</p>}</CardContent></Card>;
            })}
          </div>
        </section>

        <section aria-labelledby="analytics-top-posts-title" className="space-y-3">
          <h2 id="analytics-top-posts-title" className="text-base font-medium">Top posts</h2>
          {analytics.topPosts.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No analytics data is available for this range.</CardContent></Card> : <div className="space-y-3">{analytics.topPosts.map((post) => <Card key={`${post.postId}-${post.platform}`} className="p-4"><CardContent className="p-0"><div className="flex flex-wrap items-start justify-between gap-2"><p className="line-clamp-2 break-words text-sm">{post.caption}</p><span className="text-xs text-muted-foreground">{PLATFORM_META[post.platform].label}</span></div><p className="mt-2 text-xs text-muted-foreground">{metric(post.metrics.views)} views · {metric(post.metrics.engagement)} engagement</p></CardContent></Card>)}</div>}
        </section>
      </div>
    </>
  );
}
