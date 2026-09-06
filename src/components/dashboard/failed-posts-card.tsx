import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { RetryButton } from "@/components/posts/retry-button";
import { EmptyState } from "@/components/shared/empty-state";
import { PlatformBadge } from "@/components/shared/platform-badge";
import { PlatformStatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PlatformTarget } from "@/lib/domain/types";
import { humanErrorMessage } from "@/lib/errors";
import { PLATFORM_META } from "@/lib/status";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export type FailedTarget = {
  postId: string;
  caption: string;
  target: PlatformTarget;
  /** Platforms the post targets — decides "Retry" vs "Retry TikTok". */
  platformCount: number;
};

/**
 * One row per failed platform, not per post: the user fixes one platform at a
 * time, and retrying never touches the platforms that already succeeded.
 */
export function FailedPostsCard({ items }: { items: FailedTarget[] }) {
  return (
    <Card className="rounded-lg border-primary/15">
      <CardHeader>
        <p className="text-base font-medium">Failed posts</p>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            tone="success"
            title="No failed posts"
            body="Everything you published went through."
          />
        ) : (
          <ul className="space-y-4">
            {items.map((item, index) => {
              const label = PLATFORM_META[item.target.platform].label;

              return (
                <li key={item.target.id} className="space-y-4">
                  {index > 0 ? <Separator /> : null}

                  <div className="space-y-3">
                    <p className="line-clamp-1 break-words text-sm font-medium">
                      {item.caption}
                    </p>

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <PlatformBadge platform={item.target.platform} />
                          <PlatformStatusBadge status="failed" />
                        </div>
                        <p className="break-words text-sm">
                          {item.target.errorMessage ??
                            humanErrorMessage(
                              item.target.platform,
                              item.target.errorCode,
                            )}
                        </p>
                      </div>

                      <RetryButton
                        postPlatformId={item.target.id}
                        label={
                          item.platformCount > 1 ? `Retry ${label}` : "Retry"
                        }
                        disabled={item.target.needsReconnect}
                        disabledReason={
                          item.target.needsReconnect ? (
                            <>
                              Reconnect {label} before retrying.{" "}
                              <Link
                                href="/connected-accounts"
                                className={`${FOCUS_RING} underline underline-offset-4`}
                              >
                                Connected accounts
                              </Link>
                            </>
                          ) : undefined
                        }
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
