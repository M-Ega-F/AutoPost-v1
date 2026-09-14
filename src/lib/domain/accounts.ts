import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { db } from "@/lib/db";
import { postPlatforms, posts, socialAccounts } from "@/lib/db/schema";
import type { Platform, SocialAccountStatus } from "@/lib/status";
import type {
  AccountHealthStatus,
  AccountManagementSummary,
  AccountSummary,
} from "@/lib/domain/types";
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
import { platformCapabilitiesFor } from "@/lib/platform-capabilities";
import { getActiveWorkspaceId } from "@/lib/domain/workspaces";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { notifyAccountEvent } from "@/lib/domain/notifications";
import { emitWebhookEventSafely } from "@/lib/webhooks/events";

const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

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

/** One summary per platform, in the fixed platform order used by the UI. */
export async function listAccountSummaries(
  userId: string,
): Promise<AccountSummary[]> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.workspaceId, workspaceId)));

  const byPlatform = new Map<Platform, SocialAccountRecord>();
  for (const row of rows) {
    const record = toRecord(row);
    if (record.status === "disconnected") continue;
    byPlatform.set(record.platform, record);
  }

  return ([
    "instagram",
    "facebook",
    "tiktok",
    "threads",
    "linkedin",
    "x",
  ] as Platform[]).map((platform) => {
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
  const workspaceId = await getActiveWorkspaceId(userId);
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.userId, userId),
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.status, "active"),
      ),
    );
  return rows.map(toRecord);
}

type AccountUsage = {
  scheduledPostCount: number;
  processingPostCount: number;
  pendingTargetCount: number;
  lastSuccessfulPublishAt: Date | null;
  lastFailedPublishAt: Date | null;
};

function emptyUsage(): AccountUsage {
  return {
    scheduledPostCount: 0,
    processingPostCount: 0,
    pendingTargetCount: 0,
    lastSuccessfulPublishAt: null,
    lastFailedPublishAt: null,
  };
}

function latestDate(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate) return current;
  if (!current || candidate > current) return candidate;
  return current;
}

function healthFor(
  row: typeof socialAccounts.$inferSelect,
  now = Date.now(),
): AccountHealthStatus {
  if (row.status === "disconnected") return "disconnected";
  if (row.status === "needs_reconnect") return "needs_reconnect";
  if (row.lastErrorCode) return "error";
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= now) return "expired";
  if (
    row.tokenExpiresAt &&
    row.tokenExpiresAt.getTime() <= now + EXPIRING_SOON_MS
  ) {
    return "expiring_soon";
  }
  return row.lastValidatedAt ? "healthy" : "unknown";
}

function accountManagementSummary(
  row: typeof socialAccounts.$inferSelect,
  usage: AccountUsage,
): AccountManagementSummary {
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    healthStatus: healthFor(row),
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    accountLabel: accountLabelFor(row),
    configured: getProvider(row.platform).isConfigured(),
    // This is the persisted first connection timestamp; updatedAt changes on
    // token refresh and must not be presented as a new connection.
    connectedAt: row.createdAt,
    lastValidatedAt: row.lastValidatedAt,
    tokenExpiresAt: row.tokenExpiresAt,
    ...usage,
    healthMessage: row.lastErrorCode
      ? humanErrorMessage(row.platform, row.lastErrorCode)
      : null,
    capabilities: platformCapabilitiesFor(row.platform),
  };
}

async function usageForAccounts(
  accountIds: readonly string[],
  userId: string,
  workspaceId: string,
): Promise<Map<string, AccountUsage>> {
  const usage = new Map<string, AccountUsage>();
  if (accountIds.length === 0) return usage;

  const rows = await db
    .select({
      accountId: postPlatforms.socialAccountId,
      postId: postPlatforms.postId,
      targetStatus: postPlatforms.status,
      targetPublishedAt: postPlatforms.publishedAt,
      targetUpdatedAt: postPlatforms.updatedAt,
      postStatus: posts.status,
    })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(
      and(
        inArray(postPlatforms.socialAccountId, [...accountIds]),
        eq(posts.userId, userId),
        eq(posts.workspaceId, workspaceId),
      ),
    );

  const scheduledPosts = new Map<string, Set<string>>();
  const processingPosts = new Map<string, Set<string>>();

  for (const row of rows) {
    const current = usage.get(row.accountId) ?? emptyUsage();
    if (row.targetStatus === "pending") current.pendingTargetCount += 1;
    if (row.postStatus === "scheduled") {
      const ids = scheduledPosts.get(row.accountId) ?? new Set<string>();
      ids.add(row.postId);
      scheduledPosts.set(row.accountId, ids);
    }
    if (row.postStatus === "processing" || row.targetStatus === "processing") {
      const ids = processingPosts.get(row.accountId) ?? new Set<string>();
      ids.add(row.postId);
      processingPosts.set(row.accountId, ids);
    }
    if (row.targetStatus === "success") {
      current.lastSuccessfulPublishAt = latestDate(
        current.lastSuccessfulPublishAt,
        row.targetPublishedAt,
      );
    }
    if (row.targetStatus === "failed") {
      current.lastFailedPublishAt = latestDate(
        current.lastFailedPublishAt,
        row.targetUpdatedAt,
      );
    }
    usage.set(row.accountId, current);
  }

  for (const [accountId, ids] of scheduledPosts) {
    const current = usage.get(accountId) ?? emptyUsage();
    current.scheduledPostCount = ids.size;
    usage.set(accountId, current);
  }
  for (const [accountId, ids] of processingPosts) {
    const current = usage.get(accountId) ?? emptyUsage();
    current.processingPostCount = ids.size;
    usage.set(accountId, current);
  }

  return usage;
}

/** Returns every persisted account with safe health and usage data. */
export async function listAccountManagementSummaries(
  userId: string,
): Promise<AccountManagementSummary[]> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.workspaceId, workspaceId)));
  const usage = await usageForAccounts(
    rows.map((row) => row.id),
    userId,
    workspaceId,
  );

  return rows.map((row) => accountManagementSummary(row, usage.get(row.id) ?? emptyUsage()));
}

export async function getAccountManagementSummary(
  userId: string,
  accountId: string,
): Promise<AccountManagementSummary | null> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId), eq(socialAccounts.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!row) return null;

  const usage = await usageForAccounts([row.id], userId, workspaceId);
  return accountManagementSummary(row, usage.get(row.id) ?? emptyUsage());
}

export async function getAccountRecord(
  userId: string,
  accountId: string,
): Promise<SocialAccountRecord | null> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId), eq(socialAccounts.workspaceId, workspaceId)),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function getAccountRecordById(
  accountId: string,
  workspaceId?: string,
): Promise<SocialAccountRecord | null> {
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      workspaceId
        ? and(eq(socialAccounts.id, accountId), eq(socialAccounts.workspaceId, workspaceId))
        : eq(socialAccounts.id, accountId),
    )
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
  workspaceId?: string,
): Promise<Platform[]> {
  await requireWorkspacePermission(userId, "accounts:connect", workspaceId);
  const resolvedWorkspaceId = workspaceId ?? (await getActiveWorkspaceId(userId));
  const saved: Platform[] = [];

  for (const draft of drafts) {
    const existing = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.workspaceId, resolvedWorkspaceId),
          eq(socialAccounts.platform, draft.platform),
          eq(socialAccounts.platformAccountId, draft.platformAccountId),
        ),
      )
      .limit(1);

    const values = {
      userId,
      workspaceId: resolvedWorkspaceId,
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
      lastValidatedAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: draft.metadata ?? null,
      updatedAt: new Date(),
    };

    let accountId = existing[0]?.id ?? null;
    if (existing.length > 0) {
      await db
        .update(socialAccounts)
        .set(values)
        .where(eq(socialAccounts.id, existing[0].id));
    } else {
      const [created] = await db.insert(socialAccounts).values(values).returning({ id: socialAccounts.id });
      accountId = created?.id ?? null;
    }

    saved.push(draft.platform);
    if (accountId) void emitWebhookEventSafely({ workspaceId: resolvedWorkspaceId, type: "account.connected", data: { accountId } });
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
  await notifyAccountEvent(
    accountId,
    code === "token_expired" ? "ACCOUNT_EXPIRED" : "ACCOUNT_RECONNECT_REQUIRED",
  ).catch((error) => {
    logger.warn("account notification failed", {
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Removes the link between the app and the account: drops the stored tokens,
 * fails any pending targets that pointed at it, and removes their queue jobs.
 */
export async function disconnectAccount(
  userId: string,
  accountId: string,
): Promise<void> {
  await requireWorkspacePermission(userId, "accounts:disconnect");
  const workspaceId = await getActiveWorkspaceId(userId);
  const jobIds: Array<string | null> = [];

  await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(socialAccounts)
      .where(
        and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId), eq(socialAccounts.workspaceId, workspaceId)),
      )
      .limit(1);

    if (!account) {
      throw new AppError("not_found", "We couldn't find that account.");
    }

    const processing = await tx
      .select({ id: postPlatforms.id })
      .from(postPlatforms)
      .innerJoin(posts, eq(posts.id, postPlatforms.postId))
      .where(
        and(
          eq(postPlatforms.socialAccountId, accountId),
          eq(posts.userId, userId),
          eq(posts.workspaceId, workspaceId),
          eq(postPlatforms.status, "processing"),
        ),
      );

    if (processing.length > 0) {
      throw new AppError(
        "validation_failed",
        "This account is currently being used to publish a post. Try again after publishing is complete.",
      );
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
          eq(posts.workspaceId, workspaceId),
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
          inArray(postPlatforms.id, pending.map((row) => row.id)),
          eq(postPlatforms.status, "pending"),
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
  await notifyAccountEvent(accountId, "ACCOUNT_DISCONNECTED").catch((error) => {
    logger.warn("account disconnect notification failed", { accountId, error: error instanceof Error ? error.message : String(error) });
  });
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
