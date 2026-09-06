"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireUserId } from "@/lib/auth/server";
import { disconnectAccount } from "@/lib/domain/accounts";
import { AppError, errorMessageForUser } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { normalizeTimeZone, TIMEZONE_COOKIE } from "@/lib/time";
import type { ActionResult } from "@/lib/domain/types";

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
  await requireUserId();

  try {
    const normalized = normalizeTimeZone(timezone);
    const cookieStore = await cookies();

    cookieStore.set(TIMEZONE_COOKIE, normalized, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/settings");
    revalidatePath("/create-post");
    return { ok: true };
  } catch {
    return { ok: false, message: "We couldn't save your timezone. Try again." };
  }
}
