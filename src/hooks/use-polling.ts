"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 24;

function useVisibility() {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return visible;
}

/**
 * Refreshes the current route while work is still in flight.
 *
 * Publishing is asynchronous: the request only enqueues the work. The client
 * never flips a status itself — it re-reads the database and renders whatever
 * the worker has recorded.
 */
export function usePolling({
  enabled,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: {
  enabled: boolean;
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  const visible = useVisibility();
  const [attempt, setAttempt] = React.useState(0);
  const [previousEnabled, setPreviousEnabled] = React.useState(enabled);

  // Resetting during render (not in an effect) keeps the first poll immediate.
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    setAttempt(0);
  }

  const gaveUp = enabled && attempt >= maxAttempts;

  React.useEffect(() => {
    if (!enabled || gaveUp || !visible) return;

    const timer = window.setTimeout(() => {
      router.refresh();
      setAttempt((value) => value + 1);
    }, intervalMs);

    return () => window.clearTimeout(timer);
  }, [attempt, enabled, gaveUp, intervalMs, router, visible]);

  // Coming back to a hidden tab checks the latest status immediately.
  const wasVisible = React.useRef(visible);
  React.useEffect(() => {
    if (visible && !wasVisible.current && enabled) {
      router.refresh();
    }
    wasVisible.current = visible;
  }, [enabled, router, visible]);

  return { gaveUp, isPolling: enabled && visible && !gaveUp };
}

export function useAnyProcessing(statuses: readonly string[]): boolean {
  return React.useMemo(
    () =>
      statuses.some(
        (status) => status === "processing" || status === "pending",
      ),
    [statuses],
  );
}
