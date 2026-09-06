import { TZDate } from "@date-fns/tz";
import { tzOffset } from "@date-fns/tz/tzOffset";
import { format, formatDistanceToNowStrict } from "date-fns";

export const DATE_TIME_FORMAT = "MMM d, yyyy, h:mm a";
export const DATE_FORMAT = "MMM d, yyyy";
export const TIME_FORMAT = "h:mm a";

/**
 * A curated IANA list. The stored value is always the identifier; an offset is
 * only ever shown as helper text next to it.
 */
export const TIMEZONES: readonly string[] = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export const DEFAULT_TIMEZONE = "UTC";

/** Cookie holding the user's default IANA timezone (Settings → Default timezone). */
export const TIMEZONE_COOKIE = "autopost_timezone";

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE;
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

export function guessTimeZone(): string {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) {
    return DEFAULT_TIMEZONE;
  }
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return normalizeTimeZone(resolved);
}

/**
 * Converts a wall-clock date + time in an IANA timezone into the UTC instant.
 * `date` is `YYYY-MM-DD`, `time` is `HH:mm` (24 hour).
 */
export function zonedTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    throw new Error("Invalid date or time.");
  }

  const asUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const firstOffset = tzOffset(timeZone, new Date(asUtc)) * 60_000;
  let timestamp = asUtc - firstOffset;

  // Re-resolve once so DST boundaries land on the correct side.
  const secondOffset = tzOffset(timeZone, new Date(timestamp)) * 60_000;
  if (secondOffset !== firstOffset) {
    timestamp = asUtc - secondOffset;
  }

  return new Date(timestamp);
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatInZone(
  value: Date | string | number | null | undefined,
  timeZone: string,
  pattern: string = DATE_TIME_FORMAT,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return format(new TZDate(date.getTime(), normalizeTimeZone(timeZone)), pattern);
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  timeZone: string,
): string {
  return formatInZone(value, timeZone, DATE_TIME_FORMAT);
}

export function formatDate(
  value: Date | string | number | null | undefined,
  timeZone: string,
): string {
  return formatInZone(value, timeZone, DATE_FORMAT);
}

export function formatTime(
  value: Date | string | number | null | undefined,
  timeZone: string,
): string {
  return formatInZone(value, timeZone, TIME_FORMAT);
}

export function formatDateTimeUtc(
  value: Date | string | number | null | undefined,
): string {
  return formatInZone(value, "UTC", DATE_TIME_FORMAT);
}

export function formatRelative(
  value: Date | string | number | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${formatDistanceToNowStrict(date)} ago`;
}

export function offsetMinutes(
  timeZone: string,
  at: Date | string | number = new Date(),
): number {
  const date = toDate(at) ?? new Date();
  return tzOffset(normalizeTimeZone(timeZone), date);
}

/** `GMT+7`, `GMT-4`, `GMT+0` — display only. */
export function offsetLabel(
  timeZone: string,
  at: Date | string | number = new Date(),
): string {
  const totalMinutes = offsetMinutes(timeZone, at);
  const sign = totalMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(totalMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return minutes === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

/** `Asia/Jakarta (GMT+7)` — the identifier is the value, the offset is a hint. */
export function timeZoneLabel(
  timeZone: string,
  at: Date | string | number = new Date(),
): string {
  return `${timeZone} (${offsetLabel(timeZone, at)})`;
}

export function timeOptions(): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      options.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );
    }
  }
  return options;
}

export function formatTimeOption(option: string): string {
  const [hour, minute] = option.split(":").map((part) => Number.parseInt(part, 10));
  const base = new Date(2000, 0, 1, hour, minute);
  return format(base, "h:mm a");
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatMediaMeta(meta: {
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}): string {
  const parts: string[] = [];
  if (meta.fileSize) parts.push(formatFileSize(meta.fileSize));
  if (meta.width && meta.height) parts.push(`${meta.width}x${meta.height}`);
  if (meta.duration) parts.push(formatDuration(meta.duration));
  return parts.join(" · ");
}
