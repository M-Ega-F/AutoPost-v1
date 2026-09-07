import { format } from "date-fns";

import {
  formatInZone,
  normalizeTimeZone,
  zonedTimeToUtc,
} from "@/lib/time";
import type { CalendarPost, DraftSummary } from "@/lib/domain/types";

export type CalendarMonthKey = `${number}-${string}`;

export type CalendarPostDto = Omit<CalendarPost, "scheduledAt"> & {
  scheduledAt: string;
};

export type CalendarDraftDto = {
  id: string;
  captionPreview: string;
  updatedAt: string;
};

export function toCalendarPostDto(post: CalendarPost): CalendarPostDto {
  return { ...post, scheduledAt: post.scheduledAt.toISOString() };
}

export function toCalendarDraftDto(draft: DraftSummary): CalendarDraftDto {
  return {
    id: draft.id,
    captionPreview: draft.contentText.slice(0, 80),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || !Number.isInteger(year) || month < 1 || month > 12) {
    throw new Error("Invalid calendar month.");
  }
  return { year, month };
}

function dateKeyFromUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

export function currentCalendarMonth(timeZone: string, now = new Date()): CalendarMonthKey {
  return formatInZone(now, normalizeTimeZone(timeZone), "yyyy-MM") as CalendarMonthKey;
}

export function shiftCalendarMonth(monthKey: string, amount: number): CalendarMonthKey {
  const { year, month } = parseMonthKey(monthKey);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}` as CalendarMonthKey;
}

export function calendarMonthLabel(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return format(new Date(Date.UTC(year, month - 1, 1)), "MMMM yyyy");
}

export function calendarMonthRange(
  monthKey: string,
  timeZone: string,
): { start: Date; end: Date } {
  const { year, month } = parseMonthKey(monthKey);
  const normalized = normalizeTimeZone(timeZone);
  const startKey = `${year}-${pad(month)}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const endKey = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`;
  return {
    start: zonedTimeToUtc(startKey, "00:00", normalized),
    end: zonedTimeToUtc(endKey, "00:00", normalized),
  };
}

export function calendarGridDays(monthKey: string): string[] {
  const { year, month } = parseMonthKey(monthKey);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay()));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return dateKeyFromUtcDate(day);
  });
}

export function calendarDateKey(
  value: Date | string | number,
  timeZone: string,
): string {
  return formatInZone(value, normalizeTimeZone(timeZone), "yyyy-MM-dd");
}

export function calendarDayLabel(dateKey: string): string {
  return format(dateFromKey(dateKey), "EEE");
}

export function calendarDayNumber(dateKey: string): string {
  return format(dateFromKey(dateKey), "d");
}
