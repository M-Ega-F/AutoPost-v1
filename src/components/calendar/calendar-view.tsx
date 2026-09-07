"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CancelPostButton } from "@/components/posts/cancel-post-button";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { PostStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cancelPostAction } from "@/lib/actions/posts";
import {
  calendarDateKey,
  calendarDayNumber,
  calendarGridDays,
  calendarMonthLabel,
  calendarMonthRange,
  currentCalendarMonth,
  shiftCalendarMonth,
  type CalendarDraftDto,
  type CalendarMonthKey,
  type CalendarPostDto,
} from "@/lib/calendar";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function postsByDate(posts: readonly CalendarPostDto[], timeZone: string) {
  const grouped = new Map<string, CalendarPostDto[]>();
  for (const post of posts) {
    const key = calendarDateKey(post.scheduledAt, timeZone);
    grouped.set(key, [...(grouped.get(key) ?? []), post]);
  }
  return grouped;
}

function CalendarPostItem({
  post,
  timeZone,
  onCancel,
  cancelling,
}: {
  post: CalendarPostDto;
  timeZone: string;
  onCancel: (postId: string) => void;
  cancelling: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border border-primary/20 bg-background/70 p-2 shadow-[0_0_12px_hsl(var(--neon-purple)/0.08)]">
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/history?post=${post.id}`}
          className="min-w-0 flex-1 text-left text-xs font-medium hover:text-primary"
          title={post.captionPreview || "View post details"}
        >
          <span className="block truncate tabular-nums">
            {formatTime(post.scheduledAt, timeZone)}
          </span>
          <span className="mt-1 block line-clamp-2 break-words font-normal text-muted-foreground">
            {post.captionPreview || "Untitled post"}
          </span>
        </Link>
        <PostStatusBadge status={post.status} className="shrink-0 [&>svg]:size-2.5" />
      </div>

      <div className="flex flex-wrap gap-1">
        {post.platforms.map((target) => (
          <PlatformBadge key={target.id} platform={target.platform} className="px-1.5 text-[10px]" />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Link href={`/history?post=${post.id}`} className="text-primary underline-offset-4 hover:underline">
          View details
        </Link>
        {post.canCancel ? (
          <CancelPostButton
            className="h-7 px-2 text-[11px]"
            disabled={cancelling}
            onConfirm={() => onCancel(post.id)}
          />
        ) : null}
      </div>
    </div>
  );
}

export function CalendarView({
  timeZone,
  initialMonth,
  initialPosts,
  drafts,
}: {
  timeZone: string;
  initialMonth: CalendarMonthKey;
  initialPosts: CalendarPostDto[];
  drafts: CalendarDraftDto[];
}) {
  const [month, setMonth] = useState<CalendarMonthKey>(initialMonth);
  const [posts, setPosts] = useState(initialPosts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const grouped = useMemo(() => postsByDate(posts, timeZone), [posts, timeZone]);
  const days = useMemo(() => calendarGridDays(month), [month]);
  const today = calendarDateKey(new Date(), timeZone);

  async function loadMonth(nextMonth: CalendarMonthKey) {
    setMonth(nextMonth);
    setLoading(true);
    setError(null);
    const range = calendarMonthRange(nextMonth, timeZone);
    try {
      const response = await fetch(
        `/api/calendar?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}&timezone=${encodeURIComponent(timeZone)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        posts?: CalendarPostDto[];
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "We couldn't load your calendar.");
      setPosts(payload?.posts ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't load your calendar.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelPost(postId: string) {
    setCancellingId(postId);
    const result = await cancelPostAction(postId);
    if (result.ok) {
      setPosts((current) => current.filter((post) => post.id !== postId));
      toast.success("Post cancelled.");
    } else {
      toast.error(result.message);
    }
    setCancellingId(null);
  }

  const visibleDaysWithPosts = days.filter((day) => (grouped.get(day) ?? []).length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" disabled={loading} onClick={() => void loadMonth(shiftCalendarMonth(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" className="min-w-24" disabled={loading} onClick={() => void loadMonth(currentCalendarMonth(timeZone))}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" disabled={loading} onClick={() => void loadMonth(shiftCalendarMonth(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold">{calendarMonthLabel(month)}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {loading ? <Loader2 className="size-4 animate-spin" aria-label="Loading calendar" /> : null}
          <span>{timeZone}</span>
          <Button variant="ghost" size="icon" aria-label="Refresh calendar" disabled={loading} onClick={() => void loadMonth(month)}>
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t load your calendar.</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadMonth(month)}>Try again</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="hidden overflow-x-auto rounded-lg border border-primary/20 md:block">
        <div className="grid min-w-[980px] grid-cols-7">
          {WEEKDAYS.map((day) => <div key={day} className="border-b border-primary/15 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">{day}</div>)}
          {days.map((day) => {
            const dayPosts = grouped.get(day) ?? [];
            const inMonth = day.startsWith(`${month}-`);
            const isToday = day === today;
            return (
              <div key={day} className={cn("min-h-36 border-b border-r border-primary/10 p-2 align-top", !inMonth && "bg-muted/10 text-muted-foreground", isToday && "bg-primary/5 ring-1 ring-inset ring-primary/40")}>
                <div className={cn("mb-2 flex size-7 items-center justify-center rounded-full text-xs", isToday && "bg-primary font-semibold text-primary-foreground")}>{calendarDayNumber(day)}</div>
                <div className="space-y-2">
                  {dayPosts.map((post) => <CalendarPostItem key={post.id} post={post} timeZone={timeZone} onCancel={(id) => void cancelPost(id)} cancelling={cancellingId === post.id} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {visibleDaysWithPosts.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No posts scheduled for this period.</CardContent></Card>
        ) : visibleDaysWithPosts.map((day) => (
          <Card key={day} className={cn(day === today && "border-primary/50")}>
            <CardHeader className="gap-1 px-4 pb-0">
              <p className="text-sm font-medium">{calendarDayNumber(day)}</p>
              <p className="text-xs text-muted-foreground">{day}</p>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {(grouped.get(day) ?? []).map((post) => <CalendarPostItem key={post.id} post={post} timeZone={timeZone} onCancel={(id) => void cancelPost(id)} cancelling={cancellingId === post.id} />)}
            </CardContent>
          </Card>
        ))}
      </div>

      {posts.length === 0 && !loading ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <CalendarDays className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No posts scheduled for this period.</p>
            <p className="text-sm text-muted-foreground">Create a scheduled post and it will appear here using your selected timezone.</p>
            <Button asChild><Link href="/create-post">Create post</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="px-4 pb-0">
          <p className="text-base font-medium">Unscheduled drafts</p>
          <p className="text-sm text-muted-foreground">Drafts stay here until you choose a schedule.</p>
        </CardHeader>
        <CardContent className="p-4">
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafts to continue.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.slice(0, 6).map((draft) => (
                <Link key={draft.id} href={`/drafts/${draft.id}`} className="rounded-md border border-border/70 p-3 text-sm transition-colors hover:border-primary/50 hover:bg-accent/50">
                  <span className="line-clamp-2 block">{draft.captionPreview || "Untitled draft"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Continue editing</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
