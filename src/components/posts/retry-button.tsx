"use client";

import { Loader2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { retryPlatformAction } from "@/lib/actions/posts";
import { cn } from "@/lib/utils";
import { useWorkspacePermission } from "@/components/auth/workspace-permissions";

/**
 * Retries a single platform. The action takes the platform row id, never the
 * post id, and the server refuses anything that is not `failed` — so a retry
 * can never re-publish a platform that already succeeded.
 */
export function RetryButton({
  postPlatformId,
  label,
  disabled = false,
  disabledReason,
  className,
}: {
  postPlatformId: string;
  label: string;
  disabled?: boolean;
  disabledReason?: React.ReactNode;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const canRetry = useWorkspacePermission("posts:retry");

  function retry() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await retryPlatformAction(postPlatformId);
        // No success toast: the row returns to Processing and the poller
        // reports the real result. Nothing is claimed before it is confirmed.
        if (!result.ok) setError(result.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setError("We couldn't retry this platform. Try again.");
      }
    });
  }

  return (
    <div className={cn("flex shrink-0 flex-col items-start gap-1", className)}>
      <Button
        variant="default"
        size="sm"
        className="h-11 md:h-8"
        disabled={disabled || isPending || !canRetry}
        aria-describedby={disabledReason ? reasonId : undefined}
        onClick={retry}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Retrying…
          </>
        ) : (
          label
        )}
      </Button>

      {disabledReason ? (
        <p id={reasonId} className="text-xs text-muted-foreground">
          {disabledReason}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
