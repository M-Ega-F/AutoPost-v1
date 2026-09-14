"use client";

import { History, Loader2, SquarePen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { CancelPostButton } from "@/components/posts/cancel-post-button";
import { HistoryFilters } from "@/components/posts/history-filters";
import { PostDetailPanel } from "@/components/posts/post-detail";
import { EmptyState } from "@/components/shared/empty-state";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { PlatformStatusBadge, PostStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePolling } from "@/hooks/use-polling";
import { cancelPostAction } from "@/lib/actions/posts";
import type {
  AccountSummary,
  HistoryQuery,
  PaginatedPosts,
  PostDetail as PostDetailData,
  PostSummary,
} from "@/lib/domain/types";
import { formatDateTime } from "@/lib/time";

function isPublishing(posts: readonly PostSummary[]): boolean {
  return posts.some(
    (post) =>
      post.status === "processing" ||
      post.platforms.some((target) => target.status === "processing"),
  );
}

function CreatePostButton() {
  return (
    <Button asChild>
      <Link href="/create-post">
        <SquarePen aria-hidden="true" />
        Create post
      </Link>
    </Button>
  );
}

function hasOnlyPendingTargets(post: PostSummary): boolean {
  return post.platforms.length > 0 && post.platforms.every((target) => target.status === "pending");
}

function postDate(post: PostSummary): Date {
  return post.publishedAt ?? post.scheduledAt ?? post.createdAt;
}

function postHref(query: HistoryQuery, postId: string): string {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.platform) params.set("platform", query.platform);
  if (query.accountId) params.set("accountId", query.accountId);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (query.pageSize !== 20) params.set("pageSize", String(query.pageSize));
  params.set("page", String(query.page));
  params.set("post", postId);
  return `/history?${params.toString()}`;
}

function historyHref(query: HistoryQuery, page: number): string {
  const params = new URLSearchParams(postHref(query, "").slice("/history?".length));
  params.delete("post");
  params.set("page", String(page));
  return `/history?${params.toString()}`;
}

function Pagination({
  query,
  page,
  totalPages,
  total,
}: {
  query: HistoryQuery;
  page: number;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, index) => index + 1);

  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="History pagination">
      <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total} {total === 1 ? "post" : "posts"}</p>
      <div className="flex items-center gap-1">
        {page > 1 ? <Button asChild variant="ghost" size="sm"><Link href={historyHref(query, page - 1)}>Previous</Link></Button> : null}
        {pages.map((value) => (
          <Button key={value} asChild variant={value === page ? "secondary" : "ghost"} size="sm" aria-current={value === page ? "page" : undefined}>
            <Link href={historyHref(query, value)}>{value}</Link>
          </Button>
        ))}
        {totalPages > 7 ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}
        {page < totalPages ? <Button asChild variant="ghost" size="sm"><Link href={historyHref(query, page + 1)}>Next</Link></Button> : null}
      </div>
    </nav>
  );
}

function PlatformBadges({ post }: { post: PostSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      {post.platforms.map((target) => (
        <span key={target.id} className="flex items-center gap-1">
          <PlatformBadge platform={target.platform} />
          {target.status === "failed" ? <PlatformStatusBadge status="failed" /> : null}
        </span>
      ))}
    </div>
  );
}

export function HistoryList({
  posts,
  pagination,
  query,
  accounts,
  timeZone,
  detail,
  selectedId,
  loadFailed = false,
}: {
  posts: PostSummary[];
  pagination: PaginatedPosts;
  query: HistoryQuery;
  accounts: AccountSummary[];
  timeZone: string;
  detail: PostDetailData | null;
  selectedId: string | null;
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [isCompact, setIsCompact] = useState(false);
  const [cancellingPostId, setCancellingPostId] = useState<string | null>(null);
  const [isCancelling, startCancelTransition] = useTransition();
  const { gaveUp } = usePolling({ enabled: isPublishing(posts) || (detail ? isPublishing([detail]) : false) });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsCompact(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  const showInlineDetail = !isCompact && detail !== null;
  const showDetailDialog = isCompact && detail !== null;

  function cancelPost(postId: string) {
    setCancellingPostId(postId);
    startCancelTransition(async () => {
      try {
        const result = await cancelPostAction(postId);
        if (result.ok) {
          toast.success("Post cancelled.");
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("Couldn't cancel this post. Try again.");
      } finally {
        setCancellingPostId(null);
      }
    });
  }

  function rowActions(post: PostSummary) {
    const cancelling = isCancelling && cancellingPostId === post.id;
    if (post.status === "draft") {
      return <Button asChild variant="ghost" size="sm"><Link href={`/drafts/${post.id}`}>Continue editing</Link></Button>;
    }
    if (post.status === "scheduled" || (post.status === "processing" && hasOnlyPendingTargets(post))) {
      return (
        <CancelPostButton
          title="Cancel scheduled post?"
          description="This post will not be published. You can create it again."
          keepLabel="Keep scheduled"
          disabled={cancelling}
          onConfirm={() => cancelPost(post.id)}
        />
      );
    }
    return null;
  }

  const noFilters = !query.search && !query.status && !query.platform && !query.accountId && !query.from && !query.to;

  return (
    <div className="space-y-4">
      {gaveUp ? (
        <Alert variant="default" className="border-border">
          <Loader2 className="animate-spin" aria-hidden="true" />
          <AlertTitle>Still publishing.</AlertTitle>
          <AlertDescription>We&apos;ll keep trying — refresh to check the latest status.</AlertDescription>
        </Alert>
      ) : null}

      <Card className="rounded-lg">
        <CardHeader><p className="text-base font-medium">Posts</p></CardHeader>
        <CardContent>
          <HistoryFilters query={query} accounts={accounts} timeZone={timeZone} />
          {loadFailed ? (
            <Alert variant="destructive" className="border-destructive-border">
              <AlertTitle>We couldn&apos;t load your posts.</AlertTitle>
              <AlertDescription><Button variant="outline" size="sm" className="mt-1" onClick={() => router.refresh()}>Try again</Button></AlertDescription>
            </Alert>
          ) : posts.length === 0 ? (
            <EmptyState
              icon={History}
              title={noFilters ? "No posts yet" : "No posts match your filters"}
              body={noFilters ? "Your published and scheduled posts will show up here." : "Try clearing a filter or searching for a different caption."}
              action={noFilters ? <CreatePostButton /> : <Button variant="outline" onClick={() => router.push("/history")}>Clear filters</Button>}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow><TableHead className="px-4 py-3">Post</TableHead><TableHead className="px-4 py-3">Date</TableHead><TableHead className="px-4 py-3">Status</TableHead><TableHead className="px-4 py-3">Platforms</TableHead><TableHead className="px-4 py-3 text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {posts.map((post) => {
                      const selected = post.id === selectedId;
                      return (
                        <Fragment key={post.id}>
                          <TableRow>
                            <TableCell className="max-w-md whitespace-normal px-4 py-3"><p className="line-clamp-2 break-words whitespace-pre-wrap">{post.contentText || "Untitled draft"}</p></TableCell>
                            <TableCell className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDateTime(postDate(post), timeZone)}</TableCell>
                            <TableCell className="px-4 py-3"><PostStatusBadge status={post.status} /></TableCell>
                            <TableCell className="px-4 py-3"><PlatformBadges post={post} /></TableCell>
                            <TableCell className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{rowActions(post)}<Button variant="ghost" size="sm" asChild><Link href={selected ? "/history" : postHref(query, post.id)}>{selected ? "Hide" : "View"}</Link></Button></div></TableCell>
                          </TableRow>
                          {showInlineDetail && selected ? <TableRow><TableCell colSpan={5} className="px-4 py-3"><div className="rounded-lg bg-muted p-4"><PostDetailPanel post={detail} timeZone={timeZone} /></div></TableCell></TableRow> : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {posts.map((post) => (
                  <Card key={post.id} className="gap-4 rounded-lg p-4"><div className="space-y-3"><p className="line-clamp-2 break-words whitespace-pre-wrap text-sm">{post.contentText || "Untitled draft"}</p><div className="space-y-1"><p className="text-xs text-muted-foreground">Date</p><p className="text-sm tabular-nums">{formatDateTime(postDate(post), timeZone)}</p></div><div className="space-y-1"><p className="text-xs text-muted-foreground">Status</p><PostStatusBadge status={post.status} /></div><div className="space-y-1"><p className="text-xs text-muted-foreground">Platforms</p><PlatformBadges post={post} /></div><div className="flex flex-col gap-2">{rowActions(post)}<Button variant="ghost" size="sm" className="h-11 w-full" asChild><Link href={postHref(query, post.id)}>View</Link></Button></div></div></Card>
                ))}
              </div>
            </>
          )}
          <Pagination query={query} page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} />
        </CardContent>
      </Card>

      {detail && !posts.some((post) => post.id === detail.id) ? <Card className="rounded-lg"><CardHeader><p className="text-base font-medium">Post details</p></CardHeader><CardContent><PostDetailPanel post={detail} timeZone={timeZone} /></CardContent></Card> : null}
      {showDetailDialog ? <Dialog open onOpenChange={(open) => { if (!open) router.push("/history"); }}><DialogContent className="rounded-lg"><DialogTitle className="sr-only">Post details</DialogTitle><PostDetailPanel post={detail} timeZone={timeZone} /></DialogContent></Dialog> : null}
    </div>
  );
}
