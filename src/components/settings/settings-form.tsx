"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSettingsAction } from "@/lib/actions/settings";
import { formatTimeOption, TIMEZONES, timeOptions, timeZoneLabel } from "@/lib/time";

export function SettingsForm({
  displayName: initialDisplayName,
  timezone: initialTimezone,
  defaultScheduleTime: initialScheduleTime,
}: {
  displayName: string | null;
  timezone: string;
  defaultScheduleTime: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [timezone, setTimezone] = useState(initialTimezone);
  const [defaultScheduleTime, setDefaultScheduleTime] = useState(
    initialScheduleTime,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const timezoneOptions = TIMEZONES.includes(initialTimezone)
    ? TIMEZONES
    : [initialTimezone, ...TIMEZONES];

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSettingsAction({
        displayName,
        timezone,
        defaultScheduleTime,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      toast.success("Settings saved.");
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="settings-profile-title">
        <div className="space-y-1">
          <h2 id="settings-profile-title" className="text-base font-medium">
            Profile
          </h2>
          <p className="text-sm text-muted-foreground">
            Keep your account details up to date.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-display-name">Display name</Label>
          <Input
            id="settings-display-name"
            value={displayName}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setDisplayName(event.target.value)}
            aria-describedby="settings-display-name-helper"
          />
          <p id="settings-display-name-helper" className="text-xs text-muted-foreground">
            Optional. This name is only used in your account experience.
          </p>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="settings-preferences-title">
        <div className="space-y-1">
          <h2 id="settings-preferences-title" className="text-base font-medium">
            Preferences
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose how times are shown and interpreted when you schedule posts.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-timezone">Default timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="settings-timezone" className="h-11 w-full sm:w-96">
              <SelectValue placeholder="Select a timezone" />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {timeZoneLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Existing scheduled posts keep their original publish time.
          </p>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="settings-posting-title">
        <div className="space-y-1">
          <h2 id="settings-posting-title" className="text-base font-medium">
            Posting defaults
          </h2>
          <p className="text-sm text-muted-foreground">
            Set the starting time used when you open the scheduling dialog.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-default-time">Default schedule time</Label>
          <Select value={defaultScheduleTime} onValueChange={setDefaultScheduleTime}>
            <SelectTrigger id="settings-default-time" className="h-11 w-full sm:w-48">
              <SelectValue placeholder="Select a time" />
            </SelectTrigger>
            <SelectContent>
              {timeOptions().map((option) => (
                <SelectItem key={option} value={option}>
                  {formatTimeOption(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive" className="border-destructive-border">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" variant="secondary" disabled={isPending} onClick={save}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );
}
