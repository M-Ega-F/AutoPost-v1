import { History, SquarePen } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PostStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PostSummary } from "@/lib/domain/types";
import { formatRelative } from "@/lib/time";

export function RecentActivityCard({ posts }: { posts: PostSummary[] }) {
  return (
    <Card className="rounded-lg border-primary/15">
      <CardHeader>
        <p className="text-base font-medium">Recent activity</p>
      </CardHeader>

      <CardContent>
        {posts.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            body="Posts you publish will appear here."
            action={
              <Button asChild>
                <Link href="/create-post">
                  <SquarePen aria-hidden="true" />
                  Create post
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-4">
            {posts.map((post, index) => (
              <li key={post.id} className="space-y-4">
                {index > 0 ? <Separator /> : null}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="line-clamp-1 min-w-0 break-words text-sm font-medium">
                    {post.contentText}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <PostStatusBadge status={post.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(post.publishedAt ?? post.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
