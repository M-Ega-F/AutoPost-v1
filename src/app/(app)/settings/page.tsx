import { cookies } from "next/headers";

import { LogoutButton } from "@/components/settings/logout-button";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/server";
import { getSettingsForUser } from "@/lib/services/settings";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";

export default async function SettingsPage() {
  const user = await requireUser();
  const cookieStore = await cookies();
  const fallbackTimezone = normalizeTimeZone(
    cookieStore.get(TIMEZONE_COOKIE)?.value,
  );
  const settings = await getSettingsForUser(user.id, fallbackTimezone);

  return (
    <>
      <PageHeader title="Settings" />

      <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col">
          <a href="#account-settings" className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">Account</a>
          <a href="#preferences-settings" className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">Preferences</a>
          <a href="#security-settings" className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">Security</a>
        </nav>

        <Card className="gap-8 rounded-lg p-4 shadow-none md:p-6">
        <section id="account-settings" className="space-y-2">
          <h2 className="text-base font-medium">Account</h2>
          <Label htmlFor="settings-email">Email</Label>
          <Input
            id="settings-email"
            type="email"
            value={user.email ?? ""}
            readOnly
            disabled
            className="text-muted-foreground"
          />
        </section>

        <section id="preferences-settings">
          <SettingsForm
            displayName={settings.displayName}
            timezone={settings.timezone}
            defaultScheduleTime={settings.defaultScheduleTime}
          />
        </section>

        <section id="security-settings">
          <ChangePasswordForm />
        </section>

        <div className="space-y-2 border-t border-border pt-6">
          <h2 className="text-base font-medium">Danger zone</h2>
          <LogoutButton />
        </div>
        </Card>
      </div>
    </>
  );
}
