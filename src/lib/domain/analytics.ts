import "server-only";

import { desc, eq, gte, and, isNotNull } from "drizzle-orm";
import { subDays } from "date-fns";

import { db, postAnalyticsSnapshots, postPlatforms, posts } from "@/lib/db";
import type { PostAnalyticsSnapshot } from "@/lib/db/schema";
import {
  decryptAccessToken,
  getAccountRecordById,
  markAccountNeedsReconnect,
} from "@/lib/domain/accounts";
import { ProviderError, isAuthFailure } from "@/lib/errors";
import type {
  AnalyticsMetrics,
  AnalyticsOverview,
  AnalyticsPlatformSummary,
  AnalyticsSnapshot,
  AnalyticsSnapshotStatus,
  PostAnalyticsDetail,
} from "@/lib/domain/types";
import { platformCapabilitiesFor } from "@/lib/platform-capabilities";
import { getActiveWorkspaceId } from "@/lib/domain/workspaces";
import { PLATFORMS, type Platform } from "@/lib/status";
import { formatInZone, zonedTimeToUtc } from "@/lib/time";
import { getProvider } from "@/providers/social";
import { emitWebhookEventSafely } from "@/lib/webhooks/events";

export const ANALYTICS_METRICS = [
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "reach",
  "impressions",
] as const;

export type AnalyticsRange = "7d" | "30d" | "all";

export type AnalyticsSnapshotInput = {
  postPlatformId: string;
  status: AnalyticsSnapshotStatus;
  externalPostId?: string | null;
  metrics?: Partial<AnalyticsMetrics>;
  rawMetrics?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  collectedAt?: Date;
};

export function emptyMetrics(): AnalyticsMetrics {
  return {
    views: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    reach: null,
    impressions: null,
  };
}

function normalizeMetric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function normalizedMetrics(metrics: Partial<AnalyticsMetrics> = {}): AnalyticsMetrics {
  return Object.fromEntries(
    ANALYTICS_METRICS.map((key) => [key, normalizeMetric(metrics[key])]),
  ) as AnalyticsMetrics;
}

function safeRawMetrics(rawMetrics: unknown): Record<string, number | null> | null {
  if (!rawMetrics || typeof rawMetrics !== "object" || Array.isArray(rawMetrics)) {
    return null;
  }
  const record = rawMetrics as Record<string, unknown>;
  return Object.fromEntries(
    ANALYTICS_METRICS.map((key) => [
      key,
      normalizeMetric(typeof record[key] === "number" ? record[key] : null),
    ]),
  );
}

function engagement(metrics: AnalyticsMetrics): number | null {
  const values = [metrics.likes, metrics.comments, metrics.shares, metrics.saves].filter(
    (value): value is number => value !== null,
  );
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function metricsFromRow(row: PostAnalyticsSnapshot): AnalyticsMetrics {
  return normalizedMetrics(row);
}

function toSnapshot(row: PostAnalyticsSnapshot): AnalyticsSnapshot {
  return {
    id: row.id,
    postId: row.postId,
    postPlatformId: row.postPlatformId,
    platform: row.platform,
    externalPostId: row.externalPostId,
    status: row.status,
    errorMessage: row.errorMessage,
    collectedAt: row.collectedAt,
    ...metricsFromRow(row),
  };
}

function rangeStart(range: AnalyticsRange, timeZone: string): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 6 : 29;
  const localDate = formatInZone(subDays(new Date(), days), timeZone, "yyyy-MM-dd");
  return zonedTimeToUtc(localDate, "00:00", timeZone);
}

function latestByTarget(rows: AnalyticsSnapshot[]): AnalyticsSnapshot[] {
  const latest = new Map<string, AnalyticsSnapshot>();
  for (const row of rows) {
    if (!latest.has(row.postPlatformId)) latest.set(row.postPlatformId, row);
  }
  return [...latest.values()];
}

function aggregate(rows: AnalyticsSnapshot[]): AnalyticsMetrics & { engagement: number | null } {
  const result = emptyMetrics();
  for (const key of ANALYTICS_METRICS) {
    const values = rows.map((row) => row[key]).filter(
      (value): value is number => value !== null,
    );
    result[key] = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  return { ...result, engagement: engagement(result) };
}

function metricTotal(row: AnalyticsSnapshot): number {
  return Object.values(normalizedMetrics(row)).filter(
    (value): value is number => value !== null,
  ).reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}

export async function saveAnalyticsSnapshot(
  userId: string,
  input: AnalyticsSnapshotInput,
): Promise<AnalyticsSnapshot | null> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [target] = await db
    .select({ postPlatform: postPlatforms, post: posts })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(and(eq(postPlatforms.id, input.postPlatformId), eq(posts.userId, userId), eq(posts.workspaceId, workspaceId)))
    .limit(1);

  if (!target) return null;

  const metrics = normalizedMetrics(input.metrics);
  const [row] = await db
    .insert(postAnalyticsSnapshots)
    .values({
      userId,
      postId: target.post.id,
      postPlatformId: target.postPlatform.id,
      platform: target.postPlatform.platform,
      externalPostId: input.externalPostId ?? target.postPlatform.externalPostId,
      status: input.status,
      ...metrics,
      rawMetrics: safeRawMetrics(input.rawMetrics),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      collectedAt: input.collectedAt ?? new Date(),
    })
    .returning();

  if (row) void emitWebhookEventSafely({ workspaceId, type: "analytics.updated", data: { analyticsSnapshotId: row.id, postId: row.postId, platform: row.platform } });
  return row ? toSnapshot(row) : null;
}

export async function listAnalyticsSnapshots(
  userId: string,
  options: { range?: AnalyticsRange; platform?: Platform; postId?: string; timeZone?: string } = {},
): Promise<AnalyticsSnapshot[]> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const start = rangeStart(options.range ?? "all", options.timeZone ?? "UTC");
  const conditions = [eq(postAnalyticsSnapshots.userId, userId)];
  if (start) conditions.push(gte(postAnalyticsSnapshots.collectedAt, start));
  if (options.platform) conditions.push(eq(postAnalyticsSnapshots.platform, options.platform));
  if (options.postId) conditions.push(eq(postAnalyticsSnapshots.postId, options.postId));

  const rows = await db
    .select({ snapshot: postAnalyticsSnapshots })
    .from(postAnalyticsSnapshots)
    .innerJoin(posts, eq(posts.id, postAnalyticsSnapshots.postId))
    .where(and(...conditions, eq(posts.workspaceId, workspaceId)))
    .orderBy(desc(postAnalyticsSnapshots.collectedAt), desc(postAnalyticsSnapshots.createdAt));

  return rows.map((row) => toSnapshot(row.snapshot));
}

export async function getAnalyticsOverview(
  userId: string,
  options: { range?: AnalyticsRange; platform?: Platform; timeZone?: string } = {},
): Promise<AnalyticsOverview> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const range = options.range ?? "30d";
  const snapshots = await listAnalyticsSnapshots(userId, {
    range,
    platform: options.platform,
    timeZone: options.timeZone,
  });
  const latest = latestByTarget(snapshots);

  const start = rangeStart(range, options.timeZone ?? "UTC");
  const targets = await db
    .select({ postId: postPlatforms.postId, platform: postPlatforms.platform, status: postPlatforms.status, updatedAt: postPlatforms.updatedAt })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(and(eq(posts.userId, userId), eq(posts.workspaceId, workspaceId)));
  const completedTargets = targets.filter(
    (target) =>
      (target.status === "success" || target.status === "failed") &&
      (!options.platform || target.platform === options.platform) &&
      (!start || target.updatedAt >= start),
  );
  const platformPublishedPostIds = new Set(
    completedTargets
      .filter((target) => target.status === "success")
      .map((target) => target.postId),
  );
  const postRows = await db
    .select({ id: posts.id, contentText: posts.contentText, status: posts.status, publishedAt: posts.publishedAt })
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.workspaceId, workspaceId)));
  const publishedPosts = postRows.filter(
    (post) =>
      (post.status === "published" || post.status === "partial_failure") &&
      (!start || (post.publishedAt && post.publishedAt >= start)) &&
      (!options.platform || platformPublishedPostIds.has(post.id)),
  );
  const successCount = completedTargets.filter((target) => target.status === "success").length;

  const platformRows = PLATFORMS.filter((platform) => !options.platform || platform === options.platform).map<AnalyticsPlatformSummary>((platform) => {
    const rows = latest.filter((row) => row.platform === platform);
    const latestRow = rows[0];
    return {
      platform,
      status: latestRow?.status ?? (platformCapabilitiesFor(platform).analytics ? "no_data" : "unavailable"),
      metrics: latestRow
        ? { ...normalizedMetrics(latestRow), engagement: engagement(normalizedMetrics(latestRow)) }
        : { ...emptyMetrics(), engagement: null },
      collectedAt: latestRow?.collectedAt ?? null,
    };
  });

  const topPosts = latest
    .filter((row) => row.status === "available")
    .sort((a, b) => metricTotal(b) - metricTotal(a))
    .slice(0, 5)
    .map((row) => ({
      postId: row.postId,
      caption: postRows.find((post) => post.id === row.postId)?.contentText ?? "Published post",
      platform: row.platform,
      metrics: { ...normalizedMetrics(row), engagement: engagement(row) },
      collectedAt: row.collectedAt,
    }));

  const allMetrics = aggregate(latest.filter((row) => row.status === "available"));
  return {
    range,
    platform: options.platform ?? null,
    totalPublishedPosts: publishedPosts.length,
    successRate: completedTargets.length > 0 ? successCount / completedTargets.length : null,
    metrics: allMetrics,
    platforms: platformRows,
    topPosts,
  };
}

export async function getPostAnalyticsDetail(
  userId: string,
  postId: string,
): Promise<PostAnalyticsDetail | null> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId), eq(posts.workspaceId, workspaceId)))
    .limit(1);
  if (!post) return null;

  const targets = await db
    .select({ id: postPlatforms.id, platform: postPlatforms.platform })
    .from(postPlatforms)
    .where(eq(postPlatforms.postId, postId));
  const snapshots = await listAnalyticsSnapshots(userId, { postId });

  return {
    postId,
    targets: targets.map((target) => {
      const history = snapshots.filter((row) => row.postPlatformId === target.id);
      return {
        postPlatformId: target.id,
        platform: target.platform,
        status: history[0]?.status ?? (platformCapabilitiesFor(target.platform).analytics ? "no_data" : "unavailable"),
        latest: history[0] ?? null,
        history,
      };
    }),
  };
}

export async function listAnalyticsTargetIds(
  userId: string,
  platform?: Platform,
): Promise<string[]> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const conditions = [eq(posts.userId, userId), eq(posts.workspaceId, workspaceId), eq(postPlatforms.status, "success"), isNotNull(postPlatforms.externalPostId)];
  if (platform) conditions.push(eq(postPlatforms.platform, platform));

  const rows = await db
    .select({ id: postPlatforms.id })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(and(...conditions));

  return rows.map((row) => row.id);
}

export async function syncPostPlatformAnalytics(
  postPlatformId: string,
): Promise<AnalyticsSnapshot | null> {
  const [target] = await db
    .select({ postPlatform: postPlatforms, post: posts })
    .from(postPlatforms)
    .innerJoin(posts, eq(posts.id, postPlatforms.postId))
    .where(eq(postPlatforms.id, postPlatformId))
    .limit(1);
  if (!target) return null;

  const base = {
    postPlatformId,
    externalPostId: target.postPlatform.externalPostId,
  };
  if (target.postPlatform.status !== "success" || !target.postPlatform.externalPostId) {
    return saveAnalyticsSnapshot(target.post.userId, {
      ...base,
      status: "unavailable",
      errorCode: "not_published",
      errorMessage: "Analytics are available after the post is published.",
    });
  }

  const account = await getAccountRecordById(
    target.postPlatform.socialAccountId,
    target.post.workspaceId,
  );
  const provider = getProvider(target.postPlatform.platform);
  const accountUnavailable =
    !account ||
    account.status !== "active" ||
    (account.tokenExpiresAt !== null && account.tokenExpiresAt.getTime() <= Date.now());
  if (
    accountUnavailable ||
    !platformCapabilitiesFor(target.postPlatform.platform).analytics ||
    !provider.getPostAnalytics
  ) {
    return saveAnalyticsSnapshot(target.post.userId, {
      ...base,
      status: "unavailable",
      errorCode: "provider_not_supported",
      errorMessage: accountUnavailable
        ? "Reconnect the account to fetch analytics."
        : "Analytics are not available for this platform yet.",
    });
  }

  try {
    const result = await provider.getPostAnalytics({
      account,
      accessToken: await decryptAccessToken(account),
      externalPostId: target.postPlatform.externalPostId,
    });
    return saveAnalyticsSnapshot(target.post.userId, {
      ...base,
      status: "available",
      metrics: result.metrics,
      rawMetrics: result.rawMetrics,
      collectedAt: result.collectedAt,
    });
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    if (providerError && isAuthFailure(providerError.code)) {
      await markAccountNeedsReconnect(
        account.id,
        providerError.code,
        `${account.platform} needs reconnection to refresh analytics.`,
      );
    }
    const snapshot = await saveAnalyticsSnapshot(target.post.userId, {
      ...base,
      status: "failed",
      errorCode: providerError?.code ?? "analytics_failed",
      errorMessage: "Analytics sync failed. Your published post is unchanged.",
    });
    if (providerError?.retryable) throw providerError;
    return snapshot;
  }
}
