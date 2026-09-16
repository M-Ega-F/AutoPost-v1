"use client";

import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { ReviewStatusBadge } from "@/components/posts/review/review-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ReviewInboxQuery, ReviewInboxResult } from "@/lib/domain/reviews";
import { formatDateTime } from "@/lib/time";

function hrefFor(query: ReviewInboxQuery, patch: Record<string, string | undefined> = {}): string {
  const values: Record<string, string | undefined> = { page: query.page && query.page !== 1 ? String(query.page) : undefined, status: query.status, reviewer: query.reviewer, platform: query.platform, campaignId: query.campaignId, author: query.author, search: query.search, sort: query.sort === "priority" ? undefined : query.sort, pageSize: query.pageSize && query.pageSize !== 20 ? String(query.pageSize) : undefined, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `/reviews${params.size ? `?${params.toString()}` : ""}`;
}

function ReviewRow({ item, timezone }: { item: ReviewInboxResult["items"][number]; timezone: string }) {
  return <div className="flex flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-accent/40 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2"><ReviewStatusBadge status={item.approvalStatus} />{item.isOverdue ? <Badge variant="danger">Overdue</Badge> : null}{item.isAssignedToMe ? <Badge variant="info">Assigned to me</Badge> : null}</div>
      <p className="line-clamp-2 break-words whitespace-pre-wrap text-sm">{item.contentText || "Untitled post"}</p>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{item.authorId === item.assignedReviewerId ? "Post author" : "Workspace post"}</span>{item.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}{item.reviewDueAt ? <span>Due {formatDateTime(item.reviewDueAt, timezone)}</span> : null}{item.scheduledAt ? <span>Scheduled {formatDateTime(item.scheduledAt, timezone)}</span> : null}</div>
    </div>
    <Button asChild variant="outline" size="sm"><Link href={`/history?post=${item.id}`}>Open post</Link></Button>
  </div>;
}

function ReviewSection({ title, items, timezone, empty }: { title: string; items: ReviewInboxResult["items"]; timezone: string; empty: string }) {
  return <Card><CardHeader><CardTitle className="flex items-center justify-between gap-2"><span>{title}</span><span className="text-sm font-normal text-muted-foreground">{items.length}</span></CardTitle></CardHeader><CardContent className="space-y-3">{items.length ? items.map((item) => <ReviewRow key={item.id} item={item} timezone={timezone} />) : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

export function ReviewInbox({ result, query }: { result: ReviewInboxResult; query: ReviewInboxQuery }) {
  const router = useRouter();
  const Icon = ClipboardCheck;
  const [search, setSearch] = useState(query.search ?? "");
  const waiting = result.items.filter((item) => item.approvalStatus === "in_review" && !item.isOverdue);
  const attention = result.items.filter((item) => item.isOverdue);
  const assigned = result.items.filter((item) => item.isAssignedToMe);
  const changes = result.items.filter((item) => item.approvalStatus === "changes_requested");
  const approved = result.items.filter((item) => item.approvalStatus === "approved");
  const noResults = result.items.length === 0;

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {["Pending review", "Assigned to me", "Overdue", "Changes requested", "Approved today"].map((label, index) => <Card key={label}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="space-y-1"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{[result.summary.pendingReview, result.summary.assignedToMe, result.summary.overdue, result.summary.changesRequested, result.summary.approvedToday][index]}</p></div>{index === 0 ? <Icon className="size-5 text-muted-foreground" aria-hidden="true" /> : null}</CardContent></Card>)}
    </div>
    <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
      <label className="flex-1 space-y-2 text-sm font-medium" htmlFor="review-search"><span>Search posts</span><Input id="review-search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") router.push(hrefFor(query, { search: search.trim() || undefined })); }} placeholder="Search captions" /></label>
      <label className="space-y-2 text-sm font-medium" htmlFor="review-status"><span>Status</span><select id="review-status" value={query.status ?? ""} onChange={(event) => router.push(hrefFor(query, { status: event.target.value || undefined }))} className="h-9 rounded-md border border-input bg-card px-3 text-sm"><option value="">All review work</option><option value="in_review">In review</option><option value="changes_requested">Changes requested</option><option value="approved">Approved</option></select></label>
      <label className="space-y-2 text-sm font-medium" htmlFor="review-sort"><span>Sort</span><select id="review-sort" value={query.sort ?? "priority"} onChange={(event) => router.push(hrefFor(query, { sort: event.target.value }))} className="h-9 rounded-md border border-input bg-card px-3 text-sm"><option value="priority">Needs attention</option><option value="oldest">Oldest waiting</option><option value="newest">Newest</option><option value="scheduled">Scheduled soon</option><option value="deadline">Deadline soon</option><option value="updated">Recently updated</option></select></label>
      <Button variant="secondary" onClick={() => router.push(hrefFor(query, { reviewer: query.reviewer === "me" ? undefined : "me", page: undefined }))}>{query.reviewer === "me" ? "Show everyone" : "Assigned to me"}</Button>
    </CardContent></Card>
    {noResults ? <Card><CardContent className="p-0"><EmptyState icon={Icon} title="No reviews match" body="There is no review work for these filters in the active workspace." action={<Button asChild variant="outline"><Link href="/reviews">Clear filters</Link></Button>} /></CardContent></Card> : <div className="grid gap-4 xl:grid-cols-2"><ReviewSection title="Needs attention" items={attention} timezone={result.timezone} empty="Nothing overdue." /><ReviewSection title="Waiting for review" items={waiting} timezone={result.timezone} empty="Nothing is waiting for review." /><ReviewSection title="Assigned to me" items={assigned} timezone={result.timezone} empty="Nothing is assigned to you." /><ReviewSection title="Changes requested" items={changes} timezone={result.timezone} empty="No changes requested." /><ReviewSection title="Recently approved" items={approved} timezone={result.timezone} empty="No approved posts in this result set." /></div>}
    {result.pagination.totalPages > 1 ? <nav className="flex items-center justify-between gap-3" aria-label="Review inbox pagination"><p className="text-xs text-muted-foreground">Page {result.pagination.page} of {result.pagination.totalPages} · {result.pagination.total} posts</p><div className="flex gap-2">{result.pagination.page > 1 ? <Button asChild variant="ghost" size="sm"><Link href={hrefFor(query, { page: String(result.pagination.page - 1) })}>Previous</Link></Button> : null}{result.pagination.page < result.pagination.totalPages ? <Button asChild variant="ghost" size="sm"><Link href={hrefFor(query, { page: String(result.pagination.page + 1) })}>Next</Link></Button> : null}</div></nav> : null}
  </div>;
}
