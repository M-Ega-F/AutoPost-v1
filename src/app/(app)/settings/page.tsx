import { cookies } from "next/headers";

import { LogoutButton } from "@/components/settings/logout-button";
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

      <Card className="max-w-2xl gap-8 rounded-lg p-4 shadow-none md:p-6">
        <div className="space-y-2">
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
        </div>

        <SettingsForm
          displayName={settings.displayName}
          timezone={settings.timezone}
          defaultScheduleTime={settings.defaultScheduleTime}
        />

        <div className="space-y-2 border-t border-border pt-6">
          <h2 className="text-base font-medium">Danger zone</h2>
          <LogoutButton />
        </div>
      </Card>
    </>
  );
}
