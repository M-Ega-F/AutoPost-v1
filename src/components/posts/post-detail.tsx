"use client";

/* The media URL is already a server-approved persisted reference. */
/* eslint-disable @next/next/no-img-element */

import { Copy } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { PostStatusRegion } from "@/components/posts/post-status-region";
import { RetryButton } from "@/components/posts/retry-button";
import { ReuseActions } from "@/components/posts/reuse-actions";
import { ReviewPanel } from "@/components/posts/review/review-panel";
import { PlatformStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ExecutionSummary,
  PlatformTarget,
  PostDetail as PostDetailData,
} from "@/lib/domain/types";
import { humanErrorMessage } from "@/lib/errors";
import { PLATFORM_META, type Platform } from "@/lib/status";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function PlatformName({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;

  return (
    <span className="flex items-center gap-2 text-sm font-medium">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function CopyExternalIdButton({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("External ID copied.");
    } catch {
      toast.error("We couldn't copy this ID. Copy it manually.");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 md:size-8"
          aria-label="Copy external ID"
          onClick={copy}
        >
          <Copy className="size-3" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy external ID</TooltipContent>
    </Tooltip>
  );
}

/**
 * "Attempt 2 of 3 failed · Attempt 3 of 3 succeeded". Never shows the stored
 * error code or the raw provider message.
 */
function attemptHistory(
  executions: readonly ExecutionSummary[],
  target: PlatformTarget,
): string | null {
  const attempts = executions.filter(
    (execution) => execution.platform === target.platform,
  );
  if (attempts.length === 0) return null;

  return attempts
    .map((execution) => {
      const outcome =
        execution.status === "published"
          ? "succeeded"
          : execution.status === "failed"
            ? "failed"
            : "is still processing";

      return `Attempt ${execution.attemptNumber} of ${target.maxAttempts} ${outcome}`;
    })
    .join(" · ");
}

function PlatformResultRow({
  target,
  executions,
  retryLabel,
  timeZone,
}: {
  target: PlatformTarget;
  executions: readonly ExecutionSummary[];
  retryLabel: string;
  timeZone: string;
}) {
  const label = PLATFORM_META[target.platform].label;
  const isFailed = target.status === "failed";
  const attempts = attemptHistory(executions, target);
  const lastFailedExecution = executions
    .filter(
      (execution) =>
        execution.platform === target.platform && execution.status === "failed",
    )
    .at(-1);

  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformName platform={target.platform} />
          {target.accountLabel ? (
            <span className="text-sm text-muted-foreground">· {target.accountLabel}</span>
          ) : null}
          <PlatformStatusBadge status={target.status} />
        </div>

        {isFailed ? (
          <RetryButton
            postPlatformId={target.id}
            label={retryLabel}
            disabled={target.needsReconnect}
            disabledReason={
              target.needsReconnect ? (
                <>
                  Reconnect {label} before retrying.{" "}
                  <Link
                    href="/connected-accounts"
                    className={cn(FOCUS_RING, "underline underline-offset-4")}
                  >
                    Connected accounts
                  </Link>
                </>
              ) : undefined
            }
          />
        ) : null}
      </div>

      {isFailed ? (
        <p className="break-words text-sm">
          {target.errorMessage ?? humanErrorMessage(target.platform, "unknown")}
        </p>
      ) : null}

      {isFailed && lastFailedExecution ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          Failed {formatDateTime(lastFailedExecution.executedAt ?? lastFailedExecution.startedAt, timeZone)}
        </p>
      ) : null}

      {!isFailed && target.externalPostId ? (
        <div className="flex items-center gap-1">
          <p className="truncate font-mono text-xs text-muted-foreground">
            External ID: {target.externalPostId}
          </p>
          <CopyExternalIdButton value={target.externalPostId} />
        </div>
      ) : null}

      {attempts ? (
        <p className="text-xs text-muted-foreground">{attempts}</p>
      ) : null}
    </li>
  );
}

function AnalyticsSection({ post }: { post: PostDetailData }) {
  if (!post.analytics) return null;

  return (
    <section aria-labelledby="post-analytics-title" className="space-y-3">
      <h2 id="post-analytics-title" className="text-base font-medium">Analytics</h2>
      <div className="space-y-3">
        {post.analytics.targets.map((target) => {
          const meta = PLATFORM_META[target.platform];
          const latest = target.latest;
          return (
            <div key={target.postPlatformId} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <PlatformName platform={target.platform} />
                <span className="text-xs text-muted-foreground">{target.status === "available" ? "Available" : target.status === "no_data" ? "No data yet" : "Unavailable"}</span>
              </div>
              {latest?.status === "available" ? <p className="mt-2 text-sm text-muted-foreground">{latest.views ?? "—"} views · {latest.likes ?? "—"} likes · {latest.comments ?? "—"} comments · {latest.shares ?? "—"} shares</p> : <p className="mt-2 text-sm text-muted-foreground">{meta.label} analytics are not available for this platform yet.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Per-platform results for one post. Statuses are read from the server on every
 * refresh; the client never decides that something published.
 */
export function PostDetailPanel({
  post,
  className,
  timeZone,
}: {
  post: PostDetailData;
  className?: string;
  timeZone?: string;
}) {
  const multiPlatform = post.platforms.length > 1;
  const displayTimeZone = timeZone ?? post.timezone;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <p className="text-base font-medium break-words whitespace-pre-wrap">
          {post.contentText}
        </p>
        <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div><dt className="inline">Created: </dt><dd className="inline tabular-nums">{formatDateTime(post.createdAt, displayTimeZone)}</dd></div>
          <div><dt className="inline">Updated: </dt><dd className="inline tabular-nums">{formatDateTime(post.updatedAt, displayTimeZone)}</dd></div>
          {post.scheduledAt ? <div><dt className="inline">Scheduled: </dt><dd className="inline tabular-nums">{formatDateTime(post.scheduledAt, displayTimeZone)}</dd></div> : null}
          {post.publishedAt ? <div><dt className="inline">Published: </dt><dd className="inline tabular-nums">{formatDateTime(post.publishedAt, displayTimeZone)}</dd></div> : null}
          <div><dt className="inline">Timezone: </dt><dd className="inline">{displayTimeZone}</dd></div>
        </dl>
      </div>

      <ReuseActions postId={post.id} />

      {post.media ? (
        <div className="overflow-hidden rounded-lg border border-border bg-muted">
          {post.media.previewUrl ? (
            post.media.mediaType === "video" ? (
              <video className="max-h-80 w-full object-contain" controls preload="metadata" src={post.media.previewUrl} />
            ) : (
              <img className="max-h-80 w-full object-contain" src={post.media.previewUrl} alt="Post media" />
            )
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Media unavailable</p>
          )}
        </div>
      ) : null}

      <PostStatusRegion>
        <ul className="space-y-4">
          {post.platforms.map((target) => (
            <PlatformResultRow
              key={target.id}
              target={target}
              executions={post.executions}
              timeZone={displayTimeZone}
              retryLabel={
                multiPlatform
                  ? `Retry ${PLATFORM_META[target.platform].label}`
                  : "Retry"
              }
            />
          ))}
        </ul>
      </PostStatusRegion>
      <ReviewPanel postId={post.id} />
      <AnalyticsSection post={post} />
    </div>
  );
}
