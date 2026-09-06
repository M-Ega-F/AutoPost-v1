"use client";

import { Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePolling } from "@/hooks/use-polling";

/**
 * One poller for all three cards: `router.refresh()` re-reads the whole route,
 * so a single timer keeps every card current.
 *
 * `enabled` is only true while something is actually publishing, so a retry
 * that starts after an earlier give-up resets the timer instead of inheriting
 * the exhausted one.
 */
export function DashboardPolling({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { gaveUp } = usePolling({ enabled });

  return (
    <div className="space-y-6">
      {gaveUp ? (
        <Alert variant="default" className="border-border">
          <Loader2 className="animate-spin" aria-hidden="true" />
          <AlertTitle>Still publishing.</AlertTitle>
          <AlertDescription>
            We&apos;ll keep trying — refresh to check the latest status.
          </AlertDescription>
        </Alert>
      ) : null}

      {children}
    </div>
  );
}
