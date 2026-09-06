import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { AccountCard } from "@/components/social-accounts/account-card";
import { ConnectionToasts } from "@/components/social-accounts/connection-toasts";
import { requireUserId } from "@/lib/auth/server";
import { listAccountSummaries } from "@/lib/domain/accounts";

export default async function ConnectedAccountsPage() {
  const userId = await requireUserId();
  const accounts = await listAccountSummaries(userId);

  return (
    <>
      <PageHeader
        title="Connected accounts"
        subtitle="Connect the accounts you want to publish to."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.platform} account={account} />
        ))}
      </div>

      <Suspense fallback={null}>
        <ConnectionToasts />
      </Suspense>
    </>
  );
}
