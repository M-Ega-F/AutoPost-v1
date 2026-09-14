import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  DEFAULT_TIMEZONE,
  normalizeTimeZone,
} from "@/lib/time";
import type { UserSettings } from "@/lib/domain/types";

export type UserSettingsUpdate = {
  displayName?: string | null;
  timezone?: string;
  defaultScheduleTime?: string;
};

function toSettings(row: typeof userPreferences.$inferSelect): UserSettings {
  return {
    displayName: row.displayName,
    timezone: normalizeTimeZone(row.timezone),
    defaultScheduleTime: row.defaultScheduleTime,
  };
}

export async function getUserSettings(
  userId: string,
  fallbackTimezone = DEFAULT_TIMEZONE,
): Promise<UserSettings> {
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing) return toSettings(existing);

  const [created] = await db
    .insert(userPreferences)
    .values({
      userId,
      timezone: normalizeTimeZone(fallbackTimezone),
    })
    .onConflictDoNothing({ target: userPreferences.userId })
    .returning();

  if (created) return toSettings(created);

  const [afterRace] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (!afterRace) {
    throw new AppError("server_error", "We couldn't load your settings. Try again.");
  }

  return toSettings(afterRace);
}

export async function updateUserSettings(
  userId: string,
  input: UserSettingsUpdate,
): Promise<UserSettings> {
  await getUserSettings(userId);

  const [updated] = await db
    .update(userPreferences)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.userId, userId))
    .returning();

  if (!updated) {
    throw new AppError("server_error", "We couldn't save your settings. Try again.");
  }

  return toSettings(updated);
}
