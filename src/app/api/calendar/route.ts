import { cookies } from "next/headers";

import { getUserId } from "@/lib/auth/server";
import { apiError, apiErrorFromUnknown, apiSuccess, apiValidationError } from "@/lib/api/response";
import { toCalendarPostDto } from "@/lib/calendar";
import { getCalendarForUser } from "@/lib/services/calendar";
import { getSettingsForUser } from "@/lib/services/settings";
import { isValidTimeZone, normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

function parseInstant(value: string | null): Date | null {
  if (!value || value.length > 64) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
  }

  const url = new URL(request.url);
  const start = parseInstant(url.searchParams.get("start"));
  const end = parseInstant(url.searchParams.get("end"));
  if (!start || !end || start.getTime() >= end.getTime()) {
    return apiValidationError("Choose a valid calendar date range.");
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    return apiValidationError("Calendar ranges cannot exceed 62 days.");
  }

  const cookieStore = await cookies();
  const requestedTimezone = url.searchParams.get("timezone");
  if (requestedTimezone && !isValidTimeZone(requestedTimezone)) {
    return apiValidationError("Choose a valid timezone.");
  }
  const settings = await getSettingsForUser(
    userId,
    normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value),
  );
  const timezone = requestedTimezone ?? settings.timezone;

  try {
    const posts = await getCalendarForUser(userId, { start, end });
    return apiSuccess({
      range: { start: start.toISOString(), end: end.toISOString(), timezone },
      posts: posts.map(toCalendarPostDto),
    });
  } catch (error) {
    logger.error("calendar range failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrorFromUnknown(error, "We couldn't load your calendar. Try again.");
  }
}
