import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calendarDateKey,
  calendarGridDays,
  calendarMonthRange,
  shiftCalendarMonth,
} from "@/lib/calendar";

describe("calendar date ranges", () => {
  test("uses an inclusive start and exclusive end in the user's timezone", () => {
    const range = calendarMonthRange("2026-09", "Asia/Jakarta");
    assert.equal(range.start.toISOString(), "2026-08-31T17:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-09-30T17:00:00.000Z");
  });

  test("places a UTC instant on the correct local day at a month boundary", () => {
    assert.equal(
      calendarDateKey("2026-09-30T18:00:00.000Z", "Asia/Jakarta"),
      "2026-10-01",
    );
  });

  test("creates a stable six-week grid and navigates months", () => {
    const days = calendarGridDays("2026-09");
    assert.equal(days.length, 42);
    assert.equal(days[0], "2026-08-30");
    assert.equal(days.at(-1), "2026-10-10");
    assert.equal(shiftCalendarMonth("2026-12", 1), "2027-01");
    assert.equal(shiftCalendarMonth("2026-01", -1), "2025-12");
  });
});
