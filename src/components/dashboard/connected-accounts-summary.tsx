import { Link2 } from "lucide-react";
import Link from "next/link";

import { AccountStatusBadge } from "@/components/shared/status-badge";
import { PLATFORM_META } from "@/lib/status";
import type { AccountSummary } from "@/lib/domain/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ConnectedAccountsSummary({ accounts }: { accounts: AccountSummary[] }) {
  const connectedCount = accounts.filter((account) => account.status === "active").length;

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Connected accounts</h2>
          <p className="text-sm text-muted-foreground">
            {connectedCount} of {accounts.length} platforms connected
          </p>
        </div>
        <Link
          href="/connected-accounts"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage
        </Link>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => {
          const meta = PLATFORM_META[account.platform];
          const Icon = meta.icon;
          return (
            <div key={account.platform} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{meta.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.accountLabel ?? "Not connected"}
                  </p>
                </div>
              </div>
              <AccountStatusBadge status={account.status} />
            </div>
          );
        })}
        {accounts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link2 className="size-4" aria-hidden="true" />
            Connect an account to start publishing.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
