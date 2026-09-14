import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { AccountCard } from "@/components/social-accounts/account-card";
import { ConnectionToasts } from "@/components/social-accounts/connection-toasts";
import { ConnectButton } from "@/components/social-accounts/connect-button";
import { requireUserId } from "@/lib/auth/server";
import { listAccountManagementSummaries } from "@/lib/domain/accounts";
import { PLATFORMS, PLATFORM_META } from "@/lib/status";
import { getProvider } from "@/providers/social";

export default async function ConnectedAccountsPage() {
  const userId = await requireUserId();
  const accounts = await listAccountManagementSummaries(userId);
  const accountsByPlatform = new Map(
    PLATFORMS.map((platform) => [
      platform,
      accounts.filter((account) => account.platform === platform),
    ]),
  );

  return (
    <>
      <PageHeader
        title="Connected accounts"
        subtitle="Connect the accounts you want to publish to."
      />

      <div className="space-y-8">
        {PLATFORMS.map((platform) => {
          const meta = PLATFORM_META[platform];
          const PlatformIcon = meta.icon;
          const platformAccounts = accountsByPlatform.get(platform) ?? [];
          const configured = getProvider(platform).isConfigured();

          return (
            <section key={platform} aria-labelledby={`${platform}-accounts-heading`} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PlatformIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <h2 id={`${platform}-accounts-heading`} className="text-base font-medium">{meta.label}</h2>
                    <p className="text-sm text-muted-foreground">
                      {platformAccounts.length === 0 ? "No accounts connected" : `${platformAccounts.length} account${platformAccounts.length === 1 ? "" : "s"} connected`}
                    </p>
                  </div>
                </div>
                <ConnectButton
                  platform={platform}
                  label={platformAccounts.length > 0 ? "Connect another account" : "Connect"}
                  disabled={!configured}
                />
              </div>
              {platformAccounts.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {platformAccounts.map((account) => <AccountCard key={account.id} account={account} />)}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Connect a {meta.label} account to start publishing.
                  {!configured ? " This platform isn’t set up on this server yet." : null}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Suspense fallback={null}>
        <ConnectionToasts />
      </Suspense>
    </>
  );
}
