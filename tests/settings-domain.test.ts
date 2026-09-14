import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/domain/settings";
import { userPreferences } from "@/lib/db/schema";

import {
  OTHER_USER_ID,
  USER_ID,
  setupTestDatabase,
} from "./fixtures";
import { db, getDb, seedUser } from "./db-harness";

test.beforeEach(async () => {
  await setupTestDatabase();
  await seedUser(OTHER_USER_ID);
});

test("initializes safe defaults once and preserves the legacy timezone fallback", async () => {
  const first = await getUserSettings(USER_ID, "Asia/Jakarta");
  const second = await getUserSettings(USER_ID, "America/New_York");

  assert.deepEqual(first, {
    displayName: null,
    timezone: "Asia/Jakarta",
    defaultScheduleTime: "09:00",
  });
  assert.deepEqual(second, first);

  const rows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, USER_ID));
  assert.equal(rows.length, 1);
});

test("updates only the authenticated user's preference row", async () => {
  await getUserSettings(USER_ID);
  await getUserSettings(OTHER_USER_ID);

  const updated = await updateUserSettings(USER_ID, {
    displayName: "Ega",
    timezone: "America/New_York",
    defaultScheduleTime: "18:30",
  });

  assert.deepEqual(updated, {
    displayName: "Ega",
    timezone: "America/New_York",
    defaultScheduleTime: "18:30",
  });

  const [other] = await getDb()
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, OTHER_USER_ID));
  assert.equal(other.displayName, null);
  assert.equal(other.timezone, "UTC");
});

test("clearing the display name is stored as null", async () => {
  await getUserSettings(USER_ID);
  const updated = await updateUserSettings(USER_ID, { displayName: null });

  assert.equal(updated.displayName, null);
});
