import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_TIMEZONE,
  formatDuration,
  formatFileSize,
  formatInZone,
  formatMediaMeta,
  formatTimeOption,
  isValidTimeZone,
  normalizeTimeZone,
  offsetLabel,
  timeOptions,
  zonedTimeToUtc,
  TIMEZONES,
} from "@/lib/time";

describe("zonedTimeToUtc", () => {
  test("Asia/Jakarta 20:00 is 13:00 UTC (GMT+7)", () => {
    const result = zonedTimeToUtc("2026-09-05", "20:00", "Asia/Jakarta");
    assert.equal(result.toISOString(), "2026-09-05T13:00:00.000Z");
  });

  test("the same wall clock maps to a different instant per timezone", () => {
    assert.equal(
      zonedTimeToUtc("2026-09-05", "20:00", "Asia/Singapore").toISOString(),
      "2026-09-05T12:00:00.000Z",
    );
    assert.equal(
      zonedTimeToUtc("2026-09-05", "20:00", "America/New_York").toISOString(),
      "2026-09-06T00:00:00.000Z",
    );
    assert.equal(
      zonedTimeToUtc("2026-09-05", "20:00", "Europe/London").toISOString(),
      "2026-09-05T19:00:00.000Z",
    );
    assert.equal(
      zonedTimeToUtc("2026-09-05", "20:00", "UTC").toISOString(),
      "2026-09-05T20:00:00.000Z",
    );
  });

  test("DST is honoured rather than a fixed offset (EST in January)", () => {
    assert.equal(
      zonedTimeToUtc("2026-01-15", "20:00", "America/New_York").toISOString(),
      "2026-01-16T01:00:00.000Z",
    );
  });

  test("New York is UTC-5 in winter and UTC-4 in September", () => {
    const winter = new Date("2026-01-15T20:00:00.000Z");
    const summer = new Date("2026-09-05T20:00:00.000Z");
    assert.equal(offsetLabel("America/New_York", winter), "GMT-5");
    assert.equal(offsetLabel("America/New_York", summer), "GMT-4");
  });

  test("DST boundaries resolve without throwing", () => {
    const londonGap = zonedTimeToUtc("2026-03-29", "01:30", "Europe/London");
    assert.ok(londonGap instanceof Date);
    assert.equal(Number.isNaN(londonGap.getTime()), false);
    // 01:30 does not exist on spring forward day; the resolved instant is
    // inside the transition hour, never NaN and never far away.
    assert.equal(londonGap.toISOString(), "2026-03-29T01:30:00.000Z");
    assert.ok(londonGap.getTime() >= Date.UTC(2026, 2, 29, 0, 0));
    assert.ok(londonGap.getTime() <= Date.UTC(2026, 2, 29, 3, 0));

    const newYorkFall = zonedTimeToUtc("2026-11-01", "01:30", "America/New_York");
    assert.ok(newYorkFall instanceof Date);
    assert.equal(Number.isNaN(newYorkFall.getTime()), false);
    // The first (EDT) pass of the ambiguous hour: 05:30Z.
    assert.equal(newYorkFall.toISOString(), "2026-11-01T05:30:00.000Z");
  });

  test("an unparseable date throws", () => {
    assert.throws(() => zonedTimeToUtc("yesterday", "20:00", "UTC"), {
      message: "Invalid date or time.",
    });
  });
});

describe("offsetLabel", () => {
  test("renders the display-only GMT offset", () => {
    const at = new Date("2026-09-05T00:00:00.000Z");
    assert.equal(offsetLabel("Asia/Jakarta", at), "GMT+7");
    assert.equal(offsetLabel("UTC", at), "GMT+0");
    assert.equal(offsetLabel("America/New_York", at), "GMT-4");
    assert.equal(offsetLabel("Europe/London", at), "GMT+1");
    assert.equal(offsetLabel("Asia/Singapore", at), "GMT+8");
  });

  test("half-hour offsets keep the minutes", () => {
    assert.equal(
      offsetLabel("Asia/Kolkata", new Date("2026-09-05T00:00:00.000Z")),
      "GMT+5:30",
    );
  });

  test("an unknown zone falls back to UTC instead of throwing", () => {
    assert.equal(offsetLabel("Not/AZone"), offsetLabel(DEFAULT_TIMEZONE));
  });
});

describe("formatInZone", () => {
  const instant = zonedTimeToUtc("2026-09-05", "20:00", "Asia/Jakarta");

  test("renders the wall clock in the requested zone", () => {
    assert.equal(formatInZone(instant, "Asia/Jakarta"), "Sep 5, 2026, 8:00 PM");
    assert.equal(formatInZone(instant, "UTC"), "Sep 5, 2026, 1:00 PM");
  });

  test("accepts ISO strings and epoch millis", () => {
    assert.equal(
      formatInZone("2026-09-05T13:00:00.000Z", "Asia/Jakarta"),
      "Sep 5, 2026, 8:00 PM",
    );
    assert.equal(
      formatInZone(instant.getTime(), "Asia/Jakarta"),
      "Sep 5, 2026, 8:00 PM",
    );
  });

  test("null and invalid input render an em dash", () => {
    assert.equal(formatInZone(null, "UTC"), "—");
    assert.equal(formatInZone(undefined, "UTC"), "—");
    assert.equal(formatInZone("not a date", "UTC"), "—");
  });
});

describe("timezone identifiers", () => {
  test("real IANA identifiers are accepted", () => {
    assert.equal(isValidTimeZone("Asia/Jakarta"), true);
    assert.equal(isValidTimeZone("UTC"), true);
    assert.equal(isValidTimeZone("America/New_York"), true);
  });

  test("offset strings and junk are rejected", () => {
    assert.equal(isValidTimeZone("GMT+7"), false);
    assert.equal(isValidTimeZone("Not/AZone"), false);
    assert.equal(isValidTimeZone(""), false);
  });

  test("normalizeTimeZone falls back to UTC", () => {
    assert.equal(normalizeTimeZone("Asia/Jakarta"), "Asia/Jakarta");
    assert.equal(normalizeTimeZone("GMT+7"), "UTC");
    assert.equal(normalizeTimeZone("Not/AZone"), "UTC");
    assert.equal(normalizeTimeZone(null), "UTC");
    assert.equal(normalizeTimeZone(undefined), "UTC");
    assert.equal(normalizeTimeZone(""), "UTC");
  });

  test("every curated timezone is a valid identifier", () => {
    for (const zone of TIMEZONES) {
      assert.equal(isValidTimeZone(zone), true, `${zone} should be valid`);
      assert.equal(normalizeTimeZone(zone), zone);
    }
    assert.equal(TIMEZONES.length > 30, true);
    assert.equal(TIMEZONES.includes("Asia/Jakarta"), true);
    assert.equal(TIMEZONES.at(-1), "UTC");
  });
});

describe("timeOptions", () => {
  test("returns 96 quarter-hour slots from 00:00 to 23:45", () => {
    const options = timeOptions();
    assert.equal(options.length, 96);
    assert.equal(options[0], "00:00");
    assert.equal(options[1], "00:15");
    assert.equal(options[2], "00:30");
    assert.equal(options[3], "00:45");
    assert.equal(options[4], "01:00");
    assert.equal(options[95], "23:45");
    assert.equal(new Set(options).size, 96);
  });

  test("formatTimeOption renders a 12 hour label", () => {
    assert.equal(formatTimeOption("00:00"), "12:00 AM");
    assert.equal(formatTimeOption("13:15"), "1:15 PM");
    assert.equal(formatTimeOption("23:45"), "11:45 PM");
  });
});

describe("formatFileSize", () => {
  test("bytes stay in bytes", () => {
    assert.equal(formatFileSize(0), "0 B");
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(1023), "1023 B");
  });

  test("scales through KB, MB and GB", () => {
    assert.equal(formatFileSize(1024), "1.0 KB");
    assert.equal(formatFileSize(1536), "1.5 KB");
    assert.equal(formatFileSize(1024 * 1024), "1.0 MB");
    assert.equal(formatFileSize(1024 * 1024 * 1.5), "1.5 MB");
    assert.equal(formatFileSize(15 * 1024 * 1024), "15 MB");
    assert.equal(formatFileSize(2 * 1024 * 1024 * 1024), "2.0 GB");
  });

  test("missing values render an em dash", () => {
    assert.equal(formatFileSize(null), "—");
    assert.equal(formatFileSize(undefined), "—");
  });
});

describe("formatDuration", () => {
  test("renders m:ss", () => {
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(5), "0:05");
    assert.equal(formatDuration(60), "1:00");
    assert.equal(formatDuration(95), "1:35");
    assert.equal(formatDuration(600), "10:00");
  });

  test("missing values render an em dash", () => {
    assert.equal(formatDuration(null), "—");
    assert.equal(formatDuration(undefined), "—");
  });
});

describe("formatMediaMeta", () => {
  test("joins size, dimensions and duration", () => {
    assert.equal(
      formatMediaMeta({
        fileSize: 2048,
        width: 1920,
        height: 1080,
        duration: 65,
      }),
      "2.0 KB · 1920x1080 · 1:05",
    );
  });

  test("omits missing parts", () => {
    assert.equal(formatMediaMeta({ width: 800, height: 600 }), "800x600");
    assert.equal(formatMediaMeta({}), "");
  });
});
