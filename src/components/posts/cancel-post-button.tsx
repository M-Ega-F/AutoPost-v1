"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Two-step by design: the row never cancels on a single click. The parent owns
 * the optimistic removal, so the row disappears the moment this confirms.
 */
export function CancelPostButton({
  onConfirm,
  className,
  disabled = false,
  title = "Cancel scheduled post?",
  description = "This post will not be published. You can create it again.",
  keepLabel = "Keep scheduled",
}: {
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  description?: string;
  keepLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-11 md:h-8", className)}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Cancel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{keepLabel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Cancel post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
