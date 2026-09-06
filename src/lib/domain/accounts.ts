import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { db } from "@/lib/db";
import { postPlatforms, posts, socialAccounts } from "@/lib/db/schema";
import type { Platform, SocialAccountStatus } from "@/lib/status";
import type { AccountSummary } from "@/lib/domain/types";
import type {
  ConnectedAccountDraft,
  RefreshResult,
  SocialAccountRecord,
} from "@/providers/social/types";
import { getProvider } from "@/providers/social";
import { removePublishJob } from "@/lib/queue/publish";
import { derivePostStatus } from "@/lib/status";
import { AppError, humanErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

function toRecord(row: typeof socialAccounts.$inferSelect): SocialAccountRecord {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform,
    platformAccountId: row.platformAccountId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    encryptedAccessToken: row.encryptedAccessToken,
    encryptedRefreshToken: row.encryptedRefreshToken,
    tokenExpiresAt: row.tokenExpiresAt,
    scopes: row.scopes,
    status: row.status,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    metadata: row.metadata,
  };
}

export function accountLabelFor(
  row: Pick<
    SocialAccountRecord,
    "platform" | "username" | "displayName" | "platformAccountId"
  >,
): string | null {
  if (row.platform === "facebook") {
    return row.displayName ?? row.username ?? row.platformAccountId;
  }
  return row.username ? `@${row.username}` : (row.displayName ?? null);
}

/** One summary per platform, in the fixed Instagram → Facebook → TikTok order. */
export async function listAccountSummaries(
  userId: string,
): Promise<AccountSummary[]> {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.userId, userId));

  const byPlatform = new Map<Platform, SocialAccountRecord>();
  for (const row of rows) {
    const record = toRecord(row);
    if (record.status === "disconnected") continue;
    byPlatform.set(record.platform, record);
  }

  return (["instagram", "facebook", "tiktok"] as Platform[]).map((platform) => {
    const record = byPlatform.get(platform);
    const provider = getProvider(platform);

    if (!record) {
      return {
        id: null,
        platform,
        status: "disconnected" as SocialAccountStatus,
        username: null,
        displayName: null,
        avatarUrl: null,
        accountLabel: null,
        configured: provider.isConfigured(),
      };
    }

    return {
      id: record.id,
      platform,
      status: record.status,
      username: record.username,
      displayName: record.displayName,
      avatarUrl: record.avatarUrl,
      accountLabel: accountLabelFor(record),
      configured: provider.isConfigured(),
    };
  });
}

export async function listActiveAccounts(userId: string) {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.userId, userId),
        eq(socialAccounts.status, "active"),
      ),
    );
  return rows.map(toRecord);
}

export async function getAccountRecord(
  userId: string,
  accountId: string,
): Promise<SocialAccountRecord | null> {
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function getAccountRecordById(
  accountId: string,
): Promise<SocialAccountRecord | null> {
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function decryptAccessToken(
  account: SocialAccountRecord,
): Promise<string> {
  return decryptSecret(account.encryptedAccessToken);
}

export async function decryptRefreshToken(
  account: SocialAccountRecord,
): Promise<string | null> {
  if (!account.encryptedRefreshToken) return null;
  return decryptSecret(account.encryptedRefreshToken);
}

/** Persists (or re-points) the accounts an OAuth grant returned. */
export async function saveConnectedAccounts(
  userId: string,
  drafts: ConnectedAccountDraft[],
): Promise<Platform[]> {
  const saved: Platform[] = [];

  for (const draft of drafts) {
    const existing = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, draft.platform),
          eq(socialAccounts.platformAccountId, draft.platformAccountId),
        ),
      )
      .limit(1);

    const values = {
      userId,
      platform: draft.platform,
      platformAccountId: draft.platformAccountId,
      username: draft.username ?? null,
      displayName: draft.displayName ?? null,
      avatarUrl: draft.avatarUrl ?? null,
      encryptedAccessToken: encryptSecret(draft.accessToken),
      encryptedRefreshToken: draft.refreshToken
        ? encryptSecret(draft.refreshToken)
        : null,
      tokenExpiresAt: draft.tokenExpiresAt ?? null,
      scopes: draft.scopes ?? null,
      status: "active" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: draft.metadata ?? null,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db
        .update(socialAccounts)
        .set(values)
        .where(eq(socialAccounts.id, existing[0].id));
    } else {
      await db.insert(socialAccounts).values(values);
    }

    saved.push(draft.platform);
  }

  return saved;
}

export async function saveRefreshedTokens(
  accountId: string,
  result: RefreshResult,
): Promise<void> {
  await db
    .update(socialAccounts)
    .set({
      encryptedAccessToken: encryptSecret(result.accessToken),
      encryptedRefreshToken: result.refreshToken
        ? encryptSecret(result.refreshToken)
        : null,
      tokenExpiresAt: result.tokenExpiresAt ?? null,
      status: "active",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, accountId));
}

export async function markAccountNeedsReconnect(
  accountId: string,
  code: string,
  message: string,
): Promise<void> {
  await db
    .update(socialAccounts)
    .set({
      status: "needs_reconnect",
      lastErrorCode: code,
      lastErrorMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, accountId));

  logger.warn("account needs reconnect", { accountId, code });
}

/**
 * Removes the link between the app and the account: drops the stored tokens,
 * fails any pending targets that pointed at it, and removes their queue jobs.
 */
export async function disconnectAccount(
  userId: string,
  accountId: string,
): Promise<void> {
  const jobIds: Array<string | null> = [];

  await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(socialAccounts)
      .where(
        and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)),
      )
      .limit(1);

    if (!account) {
      throw new AppError("not_found", "We couldn't find that account.");
    }

    await tx
      .update(socialAccounts)
      .set({
        status: "disconnected",
        encryptedAccessToken: "",
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, accountId));

    const pending = await tx
      .select({ id: postPlatforms.id, postId: postPlatforms.postId, jobId: postPlatforms.bullmqJobId })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(
        and(
          eq(postPlatforms.socialAccountId, accountId),
          eq(posts.userId, userId),
          inArray(postPlatforms.status, ["pending"]),
        ),
      );

    if (pending.length === 0) return;

    const postIds = new Set(pending.map((row) => row.postId));
    jobIds.push(...pending.map((row) => row.jobId));

    await tx
      .update(postPlatforms)
      .set({
        status: "failed",
        lastErrorCode: "account_disconnected",
        lastErrorMessage: humanErrorMessage(account.platform, "account_disconnected"),
        bullmqJobId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(postPlatforms.socialAccountId, accountId),
          inArray(postPlatforms.status, ["pending"]),
        ),
      );

    for (const postId of postIds) {
      const targets = await tx
        .select({ status: postPlatforms.status })
        .from(postPlatforms)
        .where(eq(postPlatforms.postId, postId));

      const next = derivePostStatus(
        targets.map((row) => row.status),
        { scheduled: false },
      );

      await tx
        .update(posts)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }
  });

  for (const jobId of jobIds) {
    await removePublishJob(jobId);
  }
}

export async function markAccountValidated(
  accountId: string,
  status: SocialAccountStatus,
): Promise<void> {
  await db
    .update(socialAccounts)
    .set({ status, lastValidatedAt: new Date(), updatedAt: new Date() })
    .where(eq(socialAccounts.id, accountId));
}
