import { encryptSecret } from "@/lib/crypto/tokens";
import {
  postMedia,
  postPlatforms,
  posts,
  socialAccounts,
} from "@/lib/db/schema";
import type { Platform } from "@/lib/status";

import {
  getDb,
  initTestDatabase,
  resetTestDatabase,
  seedUser,
} from "./db-harness";
import { resetProviders } from "./fake-providers";
import { resetQueue } from "./fake-queue";

export const USER_ID = "11111111-1111-1111-1111-111111111111";
export const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

/** Wipes every table, seeds the auth user, and clears the fakes. */
export async function setupTestDatabase(): Promise<void> {
  await initTestDatabase();
  await resetTestDatabase();
  await seedUser(USER_ID);
  resetQueue();
  resetProviders();
}

export const TEST_MEDIA = {
  storageKey: `${USER_ID}/media/test.jpg`,
  sourceUrl: null,
  mediaType: "image" as const,
  mimeType: "image/jpeg",
  fileSize: 1_024,
  width: 1080,
  height: 1080,
  duration: null,
};

export async function createAccount(
  platform: Platform,
  options: {
    userId?: string;
    status?: "active" | "needs_reconnect" | "disconnected";
    platformAccountId?: string;
    username?: string;
  } = {},
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(socialAccounts)
    .values({
      userId: options.userId ?? USER_ID,
      platform,
      platformAccountId: options.platformAccountId ?? `${platform}-1`,
      username: options.username ?? `${platform}_user`,
      displayName: `${platform} user`,
      encryptedAccessToken: encryptSecret("access-token"),
      encryptedRefreshToken: encryptSecret("refresh-token"),
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      status: options.status ?? "active",
    })
    .returning({ id: socialAccounts.id });

  return row.id;
}

export async function insertPost(
  options: {
    userId?: string;
    caption?: string;
    status?: "draft" | "scheduled" | "processing" | "published" | "partial_failure" | "failed" | "cancelled";
    scheduledAt?: Date | null;
    timezone?: string;
  } = {},
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(posts)
    .values({
      userId: options.userId ?? USER_ID,
      contentText: options.caption ?? "Test caption",
      timezone: options.timezone ?? "Asia/Jakarta",
      scheduledAt: options.scheduledAt ?? null,
      status: options.status ?? "processing",
    })
    .returning({ id: posts.id });

  await db.insert(postMedia).values({ postId: row.id, ...TEST_MEDIA });

  return row.id;
}

export async function insertTarget(
  postId: string,
  accountId: string,
  platform: Platform,
  options: { status?: "pending" | "processing" | "success" | "failed" } = {},
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(postPlatforms)
    .values({
      postId,
      socialAccountId: accountId,
      platform,
      status: options.status ?? "pending",
      maxAttempts: 3,
    })
    .returning({ id: postPlatforms.id });

  return row.id;
}

export async function getTargetRow(id: string) {
  const db = getDb();
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select()
    .from(postPlatforms)
    .where(eq(postPlatforms.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPostRow(id: string) {
  const db = getDb();
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ?? null;
}

export async function getAccountRow(id: string) {
  const db = getDb();
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, id))
    .limit(1);
  return row ?? null;
}

export async function listExecutionRows(postPlatformId: string) {
  const db = getDb();
  const { asc, eq } = await import("drizzle-orm");
  const { postExecutions } = await import("@/lib/db/schema");
  return db
    .select()
    .from(postExecutions)
    .where(eq(postExecutions.postPlatformId, postPlatformId))
    .orderBy(asc(postExecutions.attemptNumber));
}
