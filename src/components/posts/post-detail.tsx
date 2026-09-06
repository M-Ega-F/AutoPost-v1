"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { PostStatusRegion } from "@/components/posts/post-status-region";
import { RetryButton } from "@/components/posts/retry-button";
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
}: {
  target: PlatformTarget;
  executions: readonly ExecutionSummary[];
  retryLabel: string;
}) {
  const label = PLATFORM_META[target.platform].label;
  const isFailed = target.status === "failed";
  const attempts = attemptHistory(executions, target);

  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformName platform={target.platform} />
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

/**
 * Per-platform results for one post. Statuses are read from the server on every
 * refresh; the client never decides that something published.
 */
export function PostDetailPanel({
  post,
  className,
}: {
  post: PostDetailData;
  className?: string;
}) {
  const multiPlatform = post.platforms.length > 1;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <p className="text-base font-medium break-words whitespace-pre-wrap">
          {post.contentText}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(post.publishedAt ?? post.createdAt, post.timezone)} ·{" "}
          {post.timezone}
        </p>
      </div>

      <PostStatusRegion>
        <ul className="space-y-4">
          {post.platforms.map((target) => (
            <PlatformResultRow
              key={target.id}
              target={target}
              executions={post.executions}
              retryLabel={
                multiPlatform
                  ? `Retry ${PLATFORM_META[target.platform].label}`
                  : "Retry"
              }
            />
          ))}
        </ul>
      </PostStatusRegion>
    </div>
  );
}
