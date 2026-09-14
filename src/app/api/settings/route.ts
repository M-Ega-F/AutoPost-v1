import { cookies } from "next/headers";

import {
  apiError,
  apiErrorFromUnknown,
  apiSuccess,
  apiValidationError,
} from "@/lib/api/response";
import { getUserId } from "@/lib/auth/server";
import { getSettingsForUser, updateSettingsForUser } from "@/lib/services/settings";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";
import { settingsUpdateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fallbackTimezone(): Promise<string> {
  const cookieStore = await cookies();
  return normalizeTimeZone(cookieStore.get(TIMEZONE_COOKIE)?.value);
}

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Please log in to continue.",
    });
  }

  try {
    const settings = await getSettingsForUser(userId, await fallbackTimezone());
    return apiSuccess({ data: settings });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load your settings. Try again.");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) {
    return apiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Please log in to continue.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiValidationError("Send a valid JSON request.");
  }

  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError(
      parsed.error.issues[0]?.message ?? "Choose a valid setting.",
    );
  }

  try {
    const settings = await updateSettingsForUser(userId, parsed.data);
    return apiSuccess({ data: settings });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't save your settings. Try again.");
  }
}
