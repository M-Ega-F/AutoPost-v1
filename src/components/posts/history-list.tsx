"use client";

import { History, Loader2, SquarePen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

import { PostDetailPanel } from "@/components/posts/post-detail";
import { EmptyState } from "@/components/shared/empty-state";
import { PlatformBadge } from "@/components/shared/platform-badge";
import {
  PlatformStatusBadge,
  PostStatusBadge,
} from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePolling } from "@/hooks/use-polling";
import type {
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

export function HistoryList({
  posts,
  detail,
  selectedId,
  loadFailed = false,
}: {
  posts: PostSummary[];
  detail: PostDetailData | null;
  selectedId: string | null;
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [isCompact, setIsCompact] = useState(false);

  const { gaveUp } = usePolling({
    enabled: isPublishing(posts) || (detail ? isPublishing([detail]) : false),
  });

  // Below `md` the detail is a dialog; above it, an inline panel.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const showInlineDetail = !isCompact && detail !== null;
  const showDetailDialog = isCompact && detail !== null;

  return (
    <div className="space-y-4">
      {gaveUp ? (
        <Alert variant="default" className="border-border">
          <Loader2 className="animate-spin" aria-hidden="true" />
          <AlertTitle>Still publishing.</AlertTitle>
          <AlertDescription>
            We&apos;ll keep trying — refresh to check the latest status.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="rounded-lg">
        <CardHeader>
          <p className="text-base font-medium">Posts</p>
        </CardHeader>

        <CardContent>
          {loadFailed ? (
            <Alert variant="destructive" className="border-destructive-border">
              <AlertTitle>We couldn&apos;t load your posts.</AlertTitle>
              <AlertDescription>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => router.refresh()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : posts.length === 0 ? (
            <EmptyState
              icon={History}
              title="No posts yet"
              body="Your published and scheduled posts will show up here."
              action={<CreatePostButton />}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4 py-3">Post</TableHead>
                      <TableHead className="px-4 py-3">Date</TableHead>
                      <TableHead className="px-4 py-3">Status</TableHead>
                      <TableHead className="px-4 py-3">Platforms</TableHead>
                      <TableHead className="px-4 py-3 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post) => {
                      const isSelected = post.id === selectedId;

                      return (
                        <Fragment key={post.id}>
                          <TableRow>
                            <TableCell className="max-w-md px-4 py-3 whitespace-normal">
                              <p className="line-clamp-2 break-words whitespace-pre-wrap">
                                {post.contentText}
                              </p>
                            </TableCell>
                            <TableCell className="px-4 py-3 tabular-nums whitespace-nowrap">
                              {formatDateTime(
                                post.publishedAt ?? post.createdAt,
                                post.timezone,
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <PostStatusBadge status={post.status} />
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {post.platforms.map((target) => (
                                  <span
                                    key={target.id}
                                    className="flex items-center gap-1"
                                  >
                                    <PlatformBadge
                                      platform={target.platform}
                                    />
                                    {target.status === "failed" ? (
                                      <PlatformStatusBadge status="failed" />
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={
                                    isSelected
                                      ? "/history"
                                      : `/history?post=${post.id}`
                                  }
                                >
                                  {isSelected ? "Hide" : "View"}
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>

                          {showInlineDetail && isSelected ? (
                            <TableRow>
                              <TableCell colSpan={5} className="px-4 py-3">
                                <div className="rounded-lg bg-muted p-4">
                                  <PostDetailPanel post={detail} />
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {posts.map((post) => (
                  <Card key={post.id} className="gap-4 rounded-lg p-4">
                    <div className="space-y-3">
                      <p className="line-clamp-2 break-words text-sm whitespace-pre-wrap">
                        {post.contentText}
                      </p>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="text-sm tabular-nums">
                          {formatDateTime(
                            post.publishedAt ?? post.createdAt,
                            post.timezone,
                          )}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <PostStatusBadge status={post.status} />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Platforms
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {post.platforms.map((target) => (
                            <span
                              key={target.id}
                              className="flex items-center gap-1"
                            >
                              <PlatformBadge platform={target.platform} />
                              {target.status === "failed" ? (
                                <PlatformStatusBadge status="failed" />
                              ) : null}
                            </span>
                          ))}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 w-full"
                        asChild
                      >
                        <Link href={`/history?post=${post.id}`}>View</Link>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {showDetailDialog ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) router.push("/history");
          }}
        >
          <DialogContent className="rounded-lg">
            <DialogTitle className="sr-only">Post details</DialogTitle>
            <PostDetailPanel post={detail} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
