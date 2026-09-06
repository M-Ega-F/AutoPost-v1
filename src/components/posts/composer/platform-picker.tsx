"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";

import { AccountStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PLATFORM_META, type Platform } from "@/lib/status";
import type { AccountSummary } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type CompatResult = { ok: boolean; code?: string; message?: string };

export type PlatformCompatibility = Partial<Record<Platform, CompatResult>>;

/**
 * Only media problems block a platform. A caption that is too long has its own
 * inline error, and a failed check must not silently remove a platform the user
 * selected.
 */
const NON_BLOCKING_CODES = new Set([
  "caption_too_long",
  "account_disconnected",
  "account_needs_reconnect",
  "not_configured",
  "unknown",
  "rate_limited",
  "timeout",
  "network_error",
  "token_expired",
  "permission_denied",
  "provider_error",
  "publish_failed",
  "cancelled",
]);

export function blocksMedia(result: CompatResult | undefined): boolean {
  if (!result || result.ok) return false;
  return !NON_BLOCKING_CODES.has(result.code ?? "");
}

export function PlatformPicker({
  accounts,
  selected,
  onToggle,
  compatibility,
  checking,
  hasMedia,
  showMediaRequired,
  disabled = false,
}: {
  accounts: AccountSummary[];
  selected: readonly Platform[];
  onToggle: (platform: Platform, checked: boolean) => void;
  compatibility: PlatformCompatibility;
  checking: boolean;
  hasMedia: boolean;
  showMediaRequired: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-labelledby="publish-to-label" className="space-y-2">
      {accounts.map((account) => {
        const platform = account.platform;
        const meta = PLATFORM_META[platform];
        const Icon = meta.icon;
        const platformId = `platform-${platform}`;
        const helperId = `${platformId}-helper`;
        const statusId = `${platformId}-status`;

        const connected = account.status === "active";
        const needsReconnect = account.status === "needs_reconnect";
        const result = compatibility[platform];
        const incompatible = hasMedia && !checking && blocksMedia(result);
        const awaitingCheck = hasMedia && checking && result === undefined;
        const rowDisabled = disabled || !connected || awaitingCheck || incompatible;
        const checked = connected && !incompatible && selected.includes(platform);

        const mediaRequired =
          connected && !hasMedia && showMediaRequired && !disabled;

        // A disabled checkbox keeps its reason reachable for screen readers.
        const describedBy = [
          !connected || mediaRequired ? helperId : null,
          awaitingCheck || incompatible ? statusId : null,
        ]
          .filter((value): value is string => value !== null)
          .join(" ");

        return (
          <div
            key={platform}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border border-border p-3",
              incompatible && "border-warning-border",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Checkbox
                id={platformId}
                checked={checked}
                disabled={rowDisabled}
                onCheckedChange={(next) => onToggle(platform, next === true)}
                aria-describedby={
                  describedBy.length > 0 ? describedBy : undefined
                }
                className="mt-0.5"
              />

              <div className="min-w-0 space-y-1">
                <Label
                  htmlFor={platformId}
                  className={cn("gap-2", rowDisabled && "cursor-not-allowed")}
                >
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {meta.label}
                </Label>

                {account.accountLabel ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {account.accountLabel}
                  </p>
                ) : null}

                {!connected ? (
                  <p id={helperId} className="text-xs text-muted-foreground">
                    {needsReconnect
                      ? `${meta.label} needs reconnection.`
                      : `Connect ${meta.label} to publish there.`}{" "}
                    <Button
                      asChild
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                    >
                      <Link href="/connected-accounts">
                        {needsReconnect ? "Reconnect" : "Connect"}
                      </Link>
                    </Button>
                  </p>
                ) : null}

                {mediaRequired ? (
                  <p
                    id={helperId}
                    className="text-xs text-destructive"
                  >
                    Add media before publishing.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {awaitingCheck ? (
                <>
                  <Loader2
                    className="size-3 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span
                    id={statusId}
                    className="text-xs text-muted-foreground"
                  >
                    Checking media…
                  </span>
                </>
              ) : incompatible ? (
                <>
                  <AlertTriangle
                    className="size-3 text-warning"
                    aria-hidden="true"
                  />
                  <span id={statusId} className="text-xs text-warning">
                    Media format is not supported.
                  </span>
                </>
              ) : account.status !== "active" ? (
                <AccountStatusBadge status={account.status} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
