"use client";

import { format, startOfToday } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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
  formatTime,
  timeZoneLabel,
  zonedTimeToUtc,
} from "@/lib/time";

export type ScheduleValue = { date: string; time: string; timezone: string };

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

/** Date-only values stay independent from the user's system timezone. */
function fromDateString(value: string): Date {
  const [year, month, day] = value
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
}

function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!match) return DEFAULT_TIME;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour > 23 || minute > 59) return DEFAULT_TIME;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeParts(value: string): [string, string] {
  const [hour, minute] = normalizeTime(value).split(":");
  return [hour, minute];
}

function numericTimePart(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

function validTimeValue(hour: string, minute: string): string | null {
  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) return null;

  const hourValue = Number.parseInt(hour, 10);
  const minuteValue = Number.parseInt(minute, 10);
  if (hourValue > 23 || minuteValue > 59) return null;

  return `${hour}:${minute}`;
}

type ScheduleSlot = { date: string; time: string; timezone: string };

/** Today at the saved default time, or tomorrow once that slot has passed. */
function firstSlot(timezone: string, requestedTime: string): ScheduleSlot {
  const defaultTime = normalizeTime(requestedTime);
  const today = startOfToday();

  try {
    const todayAtNine = zonedTimeToUtc(
      toDateString(today),
      defaultTime,
      timezone,
    );
    if (todayAtNine.getTime() > Date.now()) {
      return { date: toDateString(today), time: defaultTime, timezone };
    }
  } catch {
    // Unresolvable zone: fall through to tomorrow.
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: toDateString(tomorrow), time: defaultTime, timezone };
}

export function ScheduleDialog({
  open,
  onOpenChange,
  defaultTimezone,
  defaultTime,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTimezone: string;
  defaultTime: string;
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
          defaultTime={defaultTime}
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
  defaultTime,
  pending,
  onConfirm,
  onCancel,
}: {
  defaultTimezone: string;
  defaultTime: string;
  pending: boolean;
  onConfirm: (schedule: ScheduleValue) => void;
  onCancel: () => void;
}) {
  const now = useNow();
  const [slot, setSlot] = useState(() => firstSlot(defaultTimezone, defaultTime));
  const { date, time, timezone } = slot;
  const [hourInput, setHourInput] = useState(() => timeParts(time)[0]);
  const [minuteInput, setMinuteInput] = useState(() => timeParts(time)[1]);

  const today = useMemo(() => startOfToday(), []);
  const enteredTime = validTimeValue(hourInput, minuteInput);
  const hourInvalid = hourInput.length === 2 && Number(hourInput) > 23;
  const minuteInvalid = minuteInput.length === 2 && Number(minuteInput) > 59;

  const scheduledAt = useMemo(() => {
    if (!enteredTime) return null;

    try {
      return zonedTimeToUtc(date, enteredTime, timezone);
    } catch {
      return null;
    }
  }, [date, enteredTime, timezone]);

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
    if (scheduledAt === null || isPast || enteredTime === null) return;
    onConfirm({ date, time: enteredTime, timezone });
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
                {format(fromDateString(date), "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromDateString(date)}
                onSelect={(next) =>
                  setSlot((current) => ({
                    ...current,
                    date: next ? toDateString(next) : current.date,
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
          <div className="flex items-center gap-2">
            <Input
              id="schedule-time"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={hourInput}
              onChange={(event) => setHourInput(numericTimePart(event.target.value))}
              onBlur={() => setHourInput((value) => value.padStart(2, "0"))}
              placeholder="09"
              aria-label="Hour"
              aria-invalid={hourInvalid || undefined}
              className="h-11 w-20 text-center font-mono tabular-nums sm:h-9"
            />
            <span className="text-muted-foreground" aria-hidden="true">
              :
            </span>
            <Input
              id="schedule-time-minute"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={minuteInput}
              onChange={(event) =>
                setMinuteInput(numericTimePart(event.target.value))
              }
              onBlur={() => setMinuteInput((value) => value.padStart(2, "0"))}
              placeholder="00"
              aria-label="Minute"
              aria-invalid={minuteInvalid || undefined}
              className="h-11 w-20 text-center font-mono tabular-nums sm:h-9"
            />
            <span className="text-xs text-muted-foreground">24-hour</span>
          </div>
          {hourInvalid ? (
            <p className="text-xs text-destructive">Hour must be between 00 and 23.</p>
          ) : null}
          {minuteInvalid ? (
            <p className="text-xs text-destructive">
              Minute must be between 00 and 59.
            </p>
          ) : null}
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
