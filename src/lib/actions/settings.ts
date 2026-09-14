"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireUserId } from "@/lib/auth/server";
import { disconnectAccount } from "@/lib/domain/accounts";
import { AppError, errorMessageForUser } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { TIMEZONE_COOKIE } from "@/lib/time";
import type { ActionResult } from "@/lib/domain/types";
import {
  updateSettingsForUser,
} from "@/lib/services/settings";
import { settingsUpdateSchema } from "@/lib/validation/schemas";

function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/create-post");
  revalidatePath("/calendar");
  revalidatePath("/history");
  revalidatePath("/scheduled");
  revalidatePath("/drafts");
}

export async function updateSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const limited = consumeRateLimit("saveSettings", userId);
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many attempts. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  const parsed = settingsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Choose a valid setting.",
      code: "validation_failed",
    };
  }

  try {
    const settings = await updateSettingsForUser(userId, parsed.data);
    if (settings.timezone) {
      const cookieStore = await cookies();
      cookieStore.set(TIMEZONE_COOKIE, settings.timezone, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    revalidateSettings();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: errorMessageForUser(
        error,
        "We couldn't save your settings. Try again.",
      ),
      code: error instanceof AppError ? error.code : undefined,
    };
  }
}

export async function disconnectAccountAction(
  accountId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const limited = consumeRateLimit("cancel", `${userId}:disconnect`);
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many attempts. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  try {
    await disconnectAccount(userId, accountId);
    revalidatePath("/connected-accounts");
    revalidatePath("/dashboard");
    revalidatePath("/create-post");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: errorMessageForUser(
        error,
        "Couldn't disconnect this account. Try again.",
      ),
      code: error instanceof AppError ? error.code : undefined,
    };
  }
}

export async function saveTimezoneAction(
  timezone: string,
): Promise<ActionResult> {
  return updateSettingsAction({ timezone });
}
