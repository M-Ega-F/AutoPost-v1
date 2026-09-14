import { AlertTriangle, CheckCircle2, Clock, ShieldQuestion, Unlink, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_STATUS_META,
  EXECUTION_STATUS_META,
  PLATFORM_STATUS_META,
  POST_STATUS_META,
  type ExecutionStatus,
  type Platform,
  type PostPlatformStatus,
  type PostStatus,
  type SocialAccountStatus,
  type StatusMeta,
} from "@/lib/status";
import type { AccountHealthStatus } from "@/lib/domain/types";

/**
 * A spinner that degrades to a static clock when the user prefers reduced
 * motion. The state is always carried by the text label too, never colour.
 */
export function StatusIcon({
  meta,
  className,
}: {
  meta: StatusMeta;
  className?: string;
}) {
  const Icon = meta.icon;
  const spinning = meta.label === "Processing";

  if (!spinning) {
    return <Icon className={cn("size-3", className)} aria-hidden="true" />;
  }

  return (
    <>
      <Icon
        className={cn("size-3 animate-spin motion-reduce:hidden", className)}
        aria-hidden="true"
      />
      <Clock
        className={cn("hidden size-3 motion-reduce:block", className)}
        aria-hidden="true"
      />
    </>
  );
}

export function StatusBadge({
  meta,
  className,
}: {
  meta: StatusMeta;
  className?: string;
}) {
  return (
    <Badge variant={meta.tone} className={className}>
      <StatusIcon meta={meta} />
      {meta.label}
    </Badge>
  );
}

export function PostStatusBadge({
  status,
  className,
}: {
  status: PostStatus;
  className?: string;
}) {
  return <StatusBadge meta={POST_STATUS_META[status]} className={className} />;
}

export function PlatformStatusBadge({
  status,
  className,
}: {
  status: PostPlatformStatus;
  className?: string;
}) {
  return (
    <StatusBadge meta={PLATFORM_STATUS_META[status]} className={className} />
  );
}

export function AccountStatusBadge({
  status,
  className,
}: {
  status: SocialAccountStatus;
  className?: string;
}) {
  return <StatusBadge meta={ACCOUNT_STATUS_META[status]} className={className} />;
}

const ACCOUNT_HEALTH_META: Record<AccountHealthStatus, StatusMeta> = {
  healthy: { label: "Healthy", tone: "success", icon: CheckCircle2 },
  expiring_soon: { label: "Expires soon", tone: "warning", icon: Clock },
  expired: { label: "Expired", tone: "danger", icon: XCircle },
  needs_reconnect: { label: "Needs reconnect", tone: "warning", icon: AlertTriangle },
  disconnected: { label: "Not connected", tone: "neutral", icon: Unlink },
  error: { label: "Connection problem", tone: "danger", icon: AlertTriangle },
  unknown: { label: "Health unknown", tone: "neutral", icon: ShieldQuestion },
};

export function AccountHealthBadge({
  status,
  className,
}: {
  status: AccountHealthStatus;
  className?: string;
}) {
  return <StatusBadge meta={ACCOUNT_HEALTH_META[status]} className={className} />;
}

export function ExecutionStatusBadge({
  status,
  className,
}: {
  status: ExecutionStatus;
  className?: string;
}) {
  return (
    <StatusBadge meta={EXECUTION_STATUS_META[status]} className={className} />
  );
}

export { StatusBadge as StatusBadgeForMeta };
export type { Platform };
