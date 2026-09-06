"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { Platform } from "@/lib/status";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * A plain link to the server route that redirects to the provider. No fetch and
 * no optimistic "Connected" state — the provider confirms, not the UI.
 */
export function ConnectButton({
  platform,
  label,
  variant = "default",
  disabled = false,
}: {
  platform: Platform;
  label: "Connect" | "Reconnect";
  variant?: "default" | "outline";
  disabled?: boolean;
}) {
  const [isConnecting, setConnecting] = useState(false);

  return (
    <a
      href={`/api/oauth/${platform}/start`}
      rel="noopener"
      aria-disabled={disabled || isConnecting || undefined}
      onClick={(event) => {
        if (disabled || isConnecting) {
          event.preventDefault();
          return;
        }
        setConnecting(true);
      }}
      className={cn(
        buttonVariants({ variant, size: "sm" }),
        "h-11 sm:h-8",
        FOCUS_RING,
        (disabled || isConnecting) &&
          "pointer-events-none opacity-50 aria-disabled:opacity-50",
      )}
    >
      {isConnecting ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Connecting…
        </>
      ) : (
        label
      )}
    </a>
  );
}
