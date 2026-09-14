import "server-only";

import { and, desc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { contentTemplates, mediaAssets, postMedia, posts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { MediaAssetSummary, PaginatedMediaAssets } from "@/lib/domain/types";
import { createSignedMediaUrl, removeMediaObject } from "@/lib/storage";
import { getActiveWorkspaceId } from "@/lib/domain/workspaces";
import { requireWorkspacePermission } from "@/lib/auth/authorization";

export const MEDIA_LIBRARY_MAX_PAGE_SIZE = 48;

export type MediaAssetInput = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video";
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export type MediaLibraryQuery = {
  page: number;
  pageSize: number;
  search?: string;
  mediaType?: "image" | "video";
};

function safePage(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function safePageSize(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MEDIA_LIBRARY_MAX_PAGE_SIZE, Math.max(1, Math.floor(value)))
    : 24;
}

async function toSummary(row: typeof mediaAssets.$inferSelect): Promise<MediaAssetSummary> {
  let previewUrl: string | null = null;
  try {
    previewUrl = await createSignedMediaUrl(row.storageKey);
  } catch {
    // A stale storage object should not make the whole library unavailable.
  }

  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    mediaType: row.mediaType,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    duration: row.duration,
    previewUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createMediaAssetForUser(
  userId: string,
  input: MediaAssetInput,
): Promise<MediaAssetSummary> {
  await requireWorkspacePermission(userId, "media:create");
  const workspaceId = await getActiveWorkspaceId(userId);
  if (!input.storageKey.startsWith(`${userId}/`)) {
    throw new AppError("forbidden", "That media file does not belong to your account.");
  }

  const [created] = await db
    .insert(mediaAssets)
    .values({
      userId,
      workspaceId,
      storageKey: input.storageKey,
      fileName: input.fileName.trim().slice(0, 160) || "media",
      mimeType: input.mimeType,
      mediaType: input.mediaType,
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      duration: input.duration,
    })
    .returning();

  return toSummary(created);
}

export async function listMediaAssetsForUser(
  userId: string,
  query: MediaLibraryQuery,
): Promise<PaginatedMediaAssets> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const page = safePage(query.page);
  const pageSize = safePageSize(query.pageSize);
  const conditions = [eq(mediaAssets.userId, userId), eq(mediaAssets.workspaceId, workspaceId)];
  const search = query.search?.trim();
  if (search) conditions.push(ilike(mediaAssets.fileName, `%${search}%`));
  if (query.mediaType) conditions.push(eq(mediaAssets.mediaType, query.mediaType));

  const where = and(...conditions);
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(mediaAssets)
      .where(where)
      .orderBy(desc(mediaAssets.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(mediaAssets).where(where),
  ]);

  const total = Number(totalRows[0]?.count ?? 0);
  return {
    items: await Promise.all(rows.map(toSummary)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getMediaAssetRowForUser(
  userId: string,
  assetId: string,
): Promise<typeof mediaAssets.$inferSelect> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId), eq(mediaAssets.workspaceId, workspaceId)))
    .limit(1);

  if (!row) throw new AppError("not_found", "That media asset was not found.");
  return row;
}

export async function getMediaAssetForUser(
  userId: string,
  assetId: string,
): Promise<MediaAssetSummary> {
  return toSummary(await getMediaAssetRowForUser(userId, assetId));
}

export async function isMediaAssetReferenced(
  userId: string,
  storageKey: string,
): Promise<boolean> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [postReference, templateReference] = await Promise.all([
    db
      .select({ id: postMedia.id })
      .from(postMedia)
      .innerJoin(posts, eq(posts.id, postMedia.postId))
      .where(and(eq(posts.userId, userId), eq(posts.workspaceId, workspaceId), eq(postMedia.storageKey, storageKey)))
      .limit(1),
    db
      .select({ id: contentTemplates.id })
      .from(contentTemplates)
      .where(
        and(
          eq(contentTemplates.userId, userId),
          eq(contentTemplates.workspaceId, workspaceId),
          eq(contentTemplates.mediaStorageKey, storageKey),
        ),
      )
      .limit(1),
  ]);

  return Boolean(postReference[0] || templateReference[0]);
}

export async function deleteMediaAssetForUser(
  userId: string,
  assetId: string,
  removeObject: (storageKey: string) => Promise<void> = removeMediaObject,
): Promise<void> {
  await requireWorkspacePermission(userId, "media:delete");
  const workspaceId = await getActiveWorkspaceId(userId);
  const asset = await getMediaAssetRowForUser(userId, assetId);
  if (await isMediaAssetReferenced(userId, asset.storageKey)) {
    throw new AppError(
      "conflict",
      "This media is still used by a post or template. Remove that reference first.",
    );
  }

  await db.delete(mediaAssets).where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.userId, userId), eq(mediaAssets.workspaceId, workspaceId)));
  await removeObject(asset.storageKey);
}
