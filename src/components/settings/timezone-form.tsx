"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveTimezoneAction } from "@/lib/actions/settings";
import { TIMEZONES, timeZoneLabel } from "@/lib/time";

export function TimezoneForm({
  initialTimezone,
}: {
  initialTimezone: string;
}) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // A zone saved elsewhere (for example the browser guess) must stay selectable.
  const options = TIMEZONES.includes(initialTimezone)
    ? TIMEZONES
    : [initialTimezone, ...TIMEZONES];

  function save() {
    startTransition(async () => {
      const result = await saveTimezoneAction(timezone);

      if (result.ok) {
        toast.success("Timezone saved.");
        router.refresh();
        return;
      }

      toast.error(result.message);
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="default-timezone">Default timezone</Label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger
            id="default-timezone"
            aria-describedby="default-timezone-helper"
            className="w-full sm:w-80"
          >
            <SelectValue placeholder="Select a timezone" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {timeZoneLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          className="h-11 sm:h-8"
          onClick={save}
        >
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

      <p id="default-timezone-helper" className="text-xs text-muted-foreground">
        Used as the starting timezone when you schedule a post.
      </p>
    </div>
  );
}
