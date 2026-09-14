import "server-only";

import {
  getUserSettings,
  updateUserSettings,
  type UserSettingsUpdate,
} from "@/lib/domain/settings";
import type { UserSettings } from "@/lib/domain/types";

export function getSettingsForUser(
  userId: string,
  fallbackTimezone?: string,
): Promise<UserSettings> {
  return getUserSettings(userId, fallbackTimezone);
}

export function updateSettingsForUser(
  userId: string,
  input: UserSettingsUpdate,
): Promise<UserSettings> {
  return updateUserSettings(userId, input);
}
