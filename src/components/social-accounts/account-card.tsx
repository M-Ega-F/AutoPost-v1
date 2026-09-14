"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConnectButton } from "@/components/social-accounts/connect-button";
import { DisconnectDialog } from "@/components/social-accounts/disconnect-dialog";
import { AccountHealthBadge, AccountStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { disconnectAccountAction } from "@/lib/actions/settings";
import type { AccountManagementSummary } from "@/lib/domain/types";
import { PLATFORM_META } from "@/lib/status";
import { cn } from "@/lib/utils";

function initialsFor(label: string): string {
  const words = label.replace(/^@/, "").split(/[\s_.-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatDate(date: Date | null): string {
  if (!date) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function capabilityLabels(account: AccountManagementSummary): string[] {
  const { capabilities } = account;
  return [
    capabilities.image ? "Images" : null,
    capabilities.video ? "Video" : null,
    capabilities.scheduling ? "Scheduling" : null,
  ].filter((value): value is string => Boolean(value));
}

export function AccountCard({ account }: { account: AccountManagementSummary }) {
  const meta = PLATFORM_META[account.platform];
  const PlatformIcon = meta.icon;
  const [isDisconnecting, setDisconnecting] = useState(false);
  const [isOptimisticallyDisconnected, setOptimisticallyDisconnected] = useState(false);
  const status = isOptimisticallyDisconnected ? "disconnected" : account.status;
  const isDisconnected = status === "disconnected";
  const name = account.accountLabel ?? account.displayName ?? "Unnamed account";
  const canConnect = account.configured;
  const capabilities = capabilityLabels(account);

  async function handleDisconnect(): Promise<boolean> {
    setDisconnecting(true);
    setOptimisticallyDisconnected(true);
    const result = await disconnectAccountAction(account.id);
    setDisconnecting(false);
    setOptimisticallyDisconnected(false);

    if (result.ok) {
      toast.success(`${meta.label} disconnected.`);
      return true;
    }

    toast.error(`Couldn't disconnect ${meta.label}. Try again.`);
    return false;
  }

  return (
    <Card className="gap-4 rounded-lg p-4 shadow-none md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlatformIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium">{name}</h2>
            <p className="text-xs text-muted-foreground">{meta.label}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <AccountStatusBadge status={status} />
          <AccountHealthBadge status={isOptimisticallyDisconnected ? "disconnected" : account.healthStatus} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Avatar className="size-9">
          {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
          <AvatarFallback>
            {account.accountLabel ? initialsFor(account.accountLabel) : <PlatformIcon className="size-4" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
        <span className={cn("text-sm", isDisconnected ? "text-muted-foreground" : "text-foreground")}>
          {account.accountLabel ?? "Account identity unavailable"}
        </span>
      </div>

      {account.healthMessage && !isDisconnected ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{account.healthMessage}</AlertDescription>
        </Alert>
      ) : null}

      {account.processingPostCount > 0 ? (
        <Alert variant="warning">
          <Clock3 aria-hidden="true" />
          <AlertDescription>
            This account is publishing {account.processingPostCount === 1 ? "a post" : `${account.processingPostCount} posts`} right now. Disconnect is temporarily unavailable.
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Connected since</dt>
          <dd className="mt-0.5 text-foreground">{formatDate(account.connectedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last checked</dt>
          <dd className="mt-0.5 text-foreground">{formatDate(account.lastValidatedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last successful publish</dt>
          <dd className="mt-0.5 text-foreground">{formatDate(account.lastSuccessfulPublishAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last failed publish</dt>
          <dd className="mt-0.5 text-foreground">{formatDate(account.lastFailedPublishAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Token expires</dt>
          <dd className="mt-0.5 text-foreground">{formatDate(account.tokenExpiresAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1" aria-label={`${meta.label} capabilities`}>
        {capabilities.map((capability) => (
          <span key={capability} className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            {capability}
          </span>
        ))}
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">Single media</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <ConnectButton
          platform={account.platform}
          label={isDisconnected ? "Connect" : "Reconnect"}
          variant={isDisconnected || account.healthStatus !== "healthy" ? "default" : "outline"}
          disabled={!canConnect}
        />
        {!isDisconnected ? (
          <DisconnectDialog
            platform={account.platform}
            accountLabel={account.accountLabel}
            scheduledPostCount={account.scheduledPostCount}
            processingPostCount={account.processingPostCount}
            disabled={isDisconnecting || account.processingPostCount > 0}
            onConfirm={handleDisconnect}
          />
        ) : null}
      </div>

      {!canConnect ? (
        <p className="text-xs text-muted-foreground">{meta.label} isn&apos;t set up on this server yet.</p>
      ) : null}
      {account.scheduledPostCount > 0 && !isDisconnected ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="size-3" aria-hidden="true" />
          {account.scheduledPostCount} scheduled {account.scheduledPostCount === 1 ? "post" : "posts"}
        </p>
      ) : null}
      <div className="sr-only" aria-live="polite">
        {isOptimisticallyDisconnected ? `${meta.label} is being disconnected.` : null}
        {status === "disconnected" ? `${meta.label} is not connected.` : null}
        {status === "active" ? `${meta.label} is connected.` : null}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Published history stays unchanged when this account is disconnected.
      </div>
    </Card>
  );
}
