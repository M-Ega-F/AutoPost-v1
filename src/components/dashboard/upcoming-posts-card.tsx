import { CalendarClock, SquarePen } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PostSummary } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/time";

export function UpcomingPostsCard({
  posts,
  timeZone,
}: {
  posts: PostSummary[];
  timeZone: string;
}) {
  return (
    <Card className="rounded-lg border-primary/15">
      <CardHeader>
        <p className="text-base font-medium">Upcoming posts</p>
      </CardHeader>

      <CardContent>
        {posts.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No scheduled posts"
            body="Create a post and choose a date to see it here."
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

                <div className="space-y-2">
                  <p className="line-clamp-1 break-words text-sm font-medium">
                    {post.contentText}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(post.scheduledAt, timeZone)} · {timeZone}
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
