"use client";

import { format, startOfToday } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIMEZONES,
  formatDateTimeUtc,
  formatDate,
  formatTime,
  formatTimeOption,
  timeOptions,
  timeZoneLabel,
  zonedTimeToUtc,
} from "@/lib/time";

export type ScheduleValue = { date: string; time: string; timezone: string };

const TIME_OPTIONS = timeOptions();
const DEFAULT_TIME = "09:00";

/** Wall-clock time, refreshed so a slot can quietly slip into the past. */
function useNow(): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

type ScheduleSlot = { date: Date; time: string; timezone: string };

/** Today at 09:00, or tomorrow once that slot has passed. */
function firstSlot(timezone: string): ScheduleSlot {
  const today = startOfToday();

  try {
    const todayAtNine = zonedTimeToUtc(
      toDateString(today),
      DEFAULT_TIME,
      timezone,
    );
    if (todayAtNine.getTime() > Date.now()) {
      return { date: today, time: DEFAULT_TIME, timezone };
    }
  } catch {
    // Unresolvable zone: fall through to tomorrow.
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: tomorrow, time: DEFAULT_TIME, timezone };
}

export function ScheduleDialog({
  open,
  onOpenChange,
  defaultTimezone,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTimezone: string;
  pending: boolean;
  onConfirm: (schedule: ScheduleValue) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            Schedule post
          </DialogTitle>
          <DialogDescription>
            Choose the date, time and timezone for this post.
          </DialogDescription>
        </DialogHeader>

        {/* Remounts on every open, so the slot always starts fresh. */}
        <ScheduleFields
          defaultTimezone={defaultTimezone}
          pending={pending}
          onConfirm={onConfirm}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleFields({
  defaultTimezone,
  pending,
  onConfirm,
  onCancel,
}: {
  defaultTimezone: string;
  pending: boolean;
  onConfirm: (schedule: ScheduleValue) => void;
  onCancel: () => void;
}) {
  const now = useNow();
  const [slot, setSlot] = useState(() => firstSlot(defaultTimezone));
  const { date, time, timezone } = slot;

  const today = useMemo(() => startOfToday(), []);

  const scheduledAt = useMemo(() => {
    try {
      return zonedTimeToUtc(toDateString(date), time, timezone);
    } catch {
      return null;
    }
  }, [date, time, timezone]);

  const isPast =
    scheduledAt !== null && now > 0 && scheduledAt.getTime() <= now;

  const zones = useMemo(
    () =>
      TIMEZONES.includes(timezone)
        ? TIMEZONES
        : ([timezone, ...TIMEZONES] as readonly string[]),
    [timezone],
  );

  function confirm() {
    if (scheduledAt === null || isPast) return;
    onConfirm({ date: toDateString(date), time, timezone });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="schedule-date">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="schedule-date"
                variant="outline"
                className="h-11 w-full justify-start sm:h-9"
              >
                <CalendarDays aria-hidden="true" />
                {formatDate(date, timezone)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(next) =>
                  setSlot((current) => ({
                    ...current,
                    date: next ?? current.date,
                  }))
                }
                disabled={{ before: today }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="schedule-time">Time</Label>
          <Select
            value={time}
            onValueChange={(value) =>
              setSlot((current) => ({ ...current, time: value }))
            }
          >
            <SelectTrigger id="schedule-time" className="h-11 w-full sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {TIME_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatTimeOption(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="schedule-timezone">Timezone</Label>
          <Select
            value={timezone}
            onValueChange={(value) =>
              setSlot((current) => ({ ...current, timezone: value }))
            }
          >
            <SelectTrigger
              id="schedule-timezone"
              className="h-11 w-full sm:h-9"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {timeZoneLabel(zone, scheduledAt ?? today)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {scheduledAt ? (
            <p className="text-xs text-muted-foreground">
              Publishes at {formatDateTimeUtc(scheduledAt)} UTC ·{" "}
              {formatTime(scheduledAt, timezone)} your time ({timezone}).
            </p>
          ) : null}

          {isPast ? (
            <p className="text-xs text-destructive">
              Choose a time in the future.
            </p>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 sm:h-9"
          onClick={confirm}
          disabled={pending || scheduledAt === null || isPast}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Scheduling…
            </>
          ) : (
            "Schedule post"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
