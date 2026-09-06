"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConnectButton } from "@/components/social-accounts/connect-button";
import { DisconnectDialog } from "@/components/social-accounts/disconnect-dialog";
import { AccountStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { disconnectAccountAction } from "@/lib/actions/settings";
import type { AccountSummary } from "@/lib/domain/types";
import { PLATFORM_META } from "@/lib/status";
import { cn } from "@/lib/utils";

function initialsFor(label: string): string {
  const words = label
    .replace(/^@/, "")
    .split(/[\s_.-]+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function AccountCard({ account }: { account: AccountSummary }) {
  const meta = PLATFORM_META[account.platform];
  const PlatformIcon = meta.icon;

  // Optimistic: while a disconnect is in flight the card reads as
  // "Not connected", then the server's own status takes over.
  const [pendingDisconnectId, setPendingDisconnectId] = useState<string | null>(
    null,
  );
  const [isDisconnecting, setDisconnecting] = useState(false);

  const isDisconnected =
    pendingDisconnectId !== null && pendingDisconnectId === account.id;
  const status = isDisconnected ? "disconnected" : account.status;
  const isConnected = status !== "disconnected";
  const name = isConnected ? account.accountLabel : null;
  const canConnect = account.configured;

  async function handleDisconnect(): Promise<boolean> {
    if (!account.id) return false;

    const accountId = account.id;
    setDisconnecting(true);
    setPendingDisconnectId(accountId);
    toast.success(`${meta.label} disconnected.`);

    const result = await disconnectAccountAction(accountId);
    setDisconnecting(false);
    setPendingDisconnectId(null);

    if (result.ok) return true;

    toast.error(`Couldn't disconnect ${meta.label}. Try again.`);
    return false;
  }

  const needsReconnect = status === "needs_reconnect";

  return (
    <Card className="gap-4 rounded-lg p-4 shadow-none md:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlatformIcon
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="text-base font-medium">{meta.label}</h2>
        </div>
        <AccountStatusBadge status={status} />
      </div>

      <div className="flex items-center gap-2">
        <Avatar className="size-9">
          {name && account.avatarUrl ? (
            <AvatarImage src={account.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback>
            {name ? (
              initialsFor(name)
            ) : (
              <PlatformIcon className="size-4" aria-hidden="true" />
            )}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "text-sm",
            name ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {name ?? "Not connected"}
        </span>
      </div>

      {needsReconnect ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription className="text-warning">
            {meta.label} needs reconnection. Scheduled posts to this account will
            fail until you reconnect.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {isConnected ? (
            <>
              <ConnectButton
                platform={account.platform}
                label="Reconnect"
                variant={needsReconnect ? "default" : "outline"}
                disabled={!canConnect}
              />
              <DisconnectDialog
                platform={account.platform}
                disabled={!account.id || isDisconnecting}
                onConfirm={handleDisconnect}
              />
            </>
          ) : (
            <ConnectButton
              platform={account.platform}
              label="Connect"
              variant="default"
              disabled={!canConnect}
            />
          )}
        </div>

        {!canConnect ? (
          <p className="text-xs text-muted-foreground">
            {meta.label} isn&apos;t set up on this server yet.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
