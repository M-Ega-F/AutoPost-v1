"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PLATFORM_META, type Platform } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useWorkspacePermission } from "@/components/auth/workspace-permissions";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function DisconnectDialog({
  platform,
  accountLabel,
  scheduledPostCount = 0,
  processingPostCount = 0,
  disabled = false,
  onConfirm,
}: {
  platform: Platform;
  accountLabel?: string | null;
  scheduledPostCount?: number;
  processingPostCount?: number;
  disabled?: boolean;
  /** Resolves `true` when the account is gone, so the dialog can close. */
  onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const label = PLATFORM_META[platform].label;
  const titleLabel = accountLabel ? `${label} account ${accountLabel}` : `${label} account`;
  const blockedByProcessing = processingPostCount > 0;
  const canDisconnect = useWorkspacePermission("accounts:disconnect");
  if (!canDisconnect) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={disabled}
          className={cn("h-11 sm:h-8", FOCUS_RING)}
        >
          Disconnect
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            Disconnect {titleLabel}?
          </DialogTitle>
          <DialogDescription>
            {blockedByProcessing
              ? "This account is currently being used to publish a post. Try again after publishing is complete."
              : scheduledPostCount > 0
                ? `${scheduledPostCount} scheduled ${scheduledPostCount === 1 ? "post" : "posts"} will fail. Published history will stay unchanged, and you can reconnect at any time.`
                : "Pending posts to this account will fail. Published history will stay unchanged, and you can reconnect at any time."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || blockedByProcessing}
            className="h-11 sm:h-9"
            onClick={() => setOpen(false)}
          >
            Keep connected
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            className="h-11 sm:h-9"
            onClick={() => {
              startTransition(async () => {
                if (await onConfirm()) setOpen(false);
              });
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Disconnecting…
              </>
            ) : blockedByProcessing ? (
              "Finish publishing first"
            ) : (
              "Disconnect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
