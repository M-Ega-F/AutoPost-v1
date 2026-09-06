"use client";

import { CalendarClock, Loader2, SquarePen } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { CancelPostButton } from "@/components/posts/cancel-post-button";
import { EmptyState } from "@/components/shared/empty-state";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { PostStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import type { PostSummary } from "@/lib/domain/types";
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

export function ScheduledList({
  posts,
  loadFailed = false,
}: {
  posts: PostSummary[];
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [visiblePosts, removePost] = useOptimistic(
    posts,
    (state: PostSummary[], removedId: string) =>
      state.filter((post) => post.id !== removedId),
  );
  const [, startTransition] = useTransition();
  const { gaveUp } = usePolling({ enabled: isPublishing(visiblePosts) });

  /**
   * Optimistic and reversible: the row goes immediately, the server answers,
   * and a failure puts the row back with a destructive toast.
   */
  function confirmCancel(postId: string) {
    toast.success("Post cancelled.");
    startTransition(async () => {
      removePost(postId);
      try {
        const result = await cancelPostAction(postId);
        if (!result.ok) toast.error(result.message);
      } catch (error) {
        unstable_rethrow(error);
        toast.error("Couldn't cancel this post. Try again.");
      }
    });
  }

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
          <p className="text-base font-medium">Scheduled posts</p>
        </CardHeader>

        <CardContent>
          {loadFailed ? (
            <Alert variant="destructive" className="border-destructive-border">
              <AlertTitle>We couldn&apos;t load your scheduled posts.</AlertTitle>
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
          ) : visiblePosts.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled"
              body="Schedule a post and it will appear here with its publish time."
              action={<CreatePostButton />}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4 py-3">Post</TableHead>
                      <TableHead className="px-4 py-3">Scheduled</TableHead>
                      <TableHead className="px-4 py-3">Platforms</TableHead>
                      <TableHead className="px-4 py-3">Status</TableHead>
                      <TableHead className="px-4 py-3 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePosts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-md px-4 py-3 whitespace-normal">
                          <p className="line-clamp-2 break-words whitespace-pre-wrap">
                            {post.contentText}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          <p className="tabular-nums">
                            {formatDateTime(post.scheduledAt, post.timezone)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {post.timezone}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {post.platforms.map((target) => (
                              <PlatformBadge
                                key={target.id}
                                platform={target.platform}
                              />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <PostStatusBadge status={post.status} />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex justify-end">
                            <CancelPostButton
                              onConfirm={() => confirmCancel(post.id)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {visiblePosts.map((post) => (
                  <Card key={post.id} className="gap-4 rounded-lg p-4">
                    <div className="space-y-3">
                      <p className="line-clamp-2 break-words text-sm whitespace-pre-wrap">
                        {post.contentText}
                      </p>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Scheduled
                        </p>
                        <p className="text-sm tabular-nums">
                          {formatDateTime(post.scheduledAt, post.timezone)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {post.timezone}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Platforms
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {post.platforms.map((target) => (
                            <PlatformBadge
                              key={target.id}
                              platform={target.platform}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <PostStatusBadge status={post.status} />
                      </div>

                      <CancelPostButton
                        className="w-full"
                        onConfirm={() => confirmCancel(post.id)}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
