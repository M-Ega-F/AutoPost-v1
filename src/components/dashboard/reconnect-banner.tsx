import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AccountSummary } from "@/lib/domain/types";
import { PLATFORM_META } from "@/lib/status";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ReconnectBanner({
  accounts,
}: {
  accounts: readonly AccountSummary[];
}) {
  if (accounts.length === 0) return null;

  const names = accounts.map((account) => PLATFORM_META[account.platform].label);
  const sentence =
    names.length === 1
      ? `${names[0]} needs reconnection.`
      : `${names.join(", ")} need reconnection.`;

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{sentence}</AlertTitle>
      <AlertDescription>
        <Button variant="link" className="h-auto px-0 text-sm" asChild>
          <Link href="/connected-accounts" className={FOCUS_RING}>
            Reconnect
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
