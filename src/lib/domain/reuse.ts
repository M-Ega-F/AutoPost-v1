import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import {
  contentTemplates,
  postMedia,
  postPlatforms,
  posts,
  type TemplateTarget,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import { listActiveAccounts } from "@/lib/domain/accounts";
import {
  cleanupUnreferencedMedia,
  type CreatePostMedia,
} from "@/lib/domain/posts";
import type {
  ContentTemplateDetail,
  ContentTemplateSummary,
  TemplateMediaSummary,
} from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import type { Platform } from "@/lib/status";
import { createSignedMediaUrl } from "@/lib/storage";
import type { TemplateInput } from "@/lib/validation/schemas";
import { MAX_ATTEMPTS } from "@/lib/domain/executions";
import { getActiveWorkspaceId } from "@/lib/domain/workspaces";
import { requireWorkspacePermission } from "@/lib/auth/authorization";

const EMPTY_TEMPLATE_CAPTION = "";

type ReusableTarget = TemplateTarget;

type ReusableMediaFields = {
  mediaStorageKey: string | null;
  mediaSourceUrl: string | null;
  mediaType: "image" | "video" | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

function mediaFromPost(row: typeof postMedia.$inferSelect | undefined): CreatePostMedia | null {
  if (!row) return null;
  return {
    storageKey: row.storageKey,
    sourceUrl: row.sourceUrl,
    mediaType: row.mediaType,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    duration: row.duration,
  };
}

function mediaFromTemplate(row: ReusableMediaFields): CreatePostMedia | null {
  if (!row.mediaStorageKey && !row.mediaSourceUrl) return null;
  if (!row.mediaType || !row.mimeType) return null;
  return {
    storageKey: row.mediaStorageKey,
    sourceUrl: row.mediaSourceUrl,
    mediaType: row.mediaType,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    duration: row.duration,
  };
}

async function resolveReusableTargets(
  userId: string,
  targets: readonly ReusableTarget[],
): Promise<Array<{ platform: Platform; socialAccountId: string }>> {
  const accounts = await listActiveAccounts(userId);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const byPlatform = new Map<Platform, (typeof accounts)[number]>();
  for (const account of accounts) {
    if (!byPlatform.has(account.platform)) byPlatform.set(account.platform, account);
  }

  const resolved: Array<{ platform: Platform; socialAccountId: string }> = [];
  const usedPlatforms = new Set<Platform>();
  for (const target of targets) {
    if (usedPlatforms.has(target.platform)) continue;

    const account = target.socialAccountId
      ? byId.get(target.socialAccountId)
      : byPlatform.get(target.platform);
    if (!account || account.platform !== target.platform) continue;

    resolved.push({ platform: target.platform, socialAccountId: account.id });
    usedPlatforms.add(target.platform);
  }

  return resolved;
}

/**
 * Creates a clean draft from reusable content. It deliberately writes only
 * draft-owned rows: no schedule, execution, provider result or queue state is
 * copied into the new lifecycle.
 */
export async function createDraftFromReusableContent(input: {
  userId: string;
  contentText: string;
  media: CreatePostMedia | null;
  targets: readonly ReusableTarget[];
}): Promise<{ postId: string; status: "draft" }> {
  await requireWorkspacePermission(input.userId, "drafts:create");
  const workspaceId = await getActiveWorkspaceId(input.userId);
  if (input.media?.storageKey && !input.media.storageKey.startsWith(`${input.userId}/`)) {
    throw new AppError("forbidden", "That media file does not belong to your account.");
  }

  const targets = await resolveReusableTargets(input.userId, input.targets);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(posts)
      .values({
        userId: input.userId,
        workspaceId,
        contentText: input.contentText,
        timezone: "UTC",
        scheduledAt: null,
        status: "draft",
        publishedAt: null,
        cancelledAt: null,
      })
      .returning({ id: posts.id });

    if (input.media) {
      await tx.insert(postMedia).values({
        postId: created.id,
        storageKey: input.media.storageKey,
        sourceUrl: input.media.sourceUrl,
        mediaType: input.media.mediaType,
        mimeType: input.media.mimeType,
        fileSize: input.media.fileSize,
        width: input.media.width,
        height: input.media.height,
        duration: input.media.duration,
        position: 0,
      });
    }

    if (targets.length > 0) {
      await tx.insert(postPlatforms).values(
        targets.map((target) => ({
          postId: created.id,
          socialAccountId: target.socialAccountId,
          platform: target.platform,
          status: "pending" as const,
          maxAttempts: MAX_ATTEMPTS,
        })),
      );
    }

    return { postId: created.id, status: "draft" as const };
  });
}

async function loadPostReusableContent(userId: string, postId: string) {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId), eq(posts.workspaceId, workspaceId)))
    .limit(1);
  if (!post) throw new AppError("not_found", "We couldn't find that post.");

  const [mediaRows, targetRows] = await Promise.all([
    db.select().from(postMedia).where(eq(postMedia.postId, postId)).orderBy(asc(postMedia.position)),
    db
      .select({ platform: postPlatforms.platform, socialAccountId: postPlatforms.socialAccountId })
      .from(postPlatforms)
      .where(eq(postPlatforms.postId, postId))
      .orderBy(asc(postPlatforms.createdAt)),
  ]);

  return {
    contentText: post.contentText,
    media: mediaFromPost(mediaRows[0]),
    targets: targetRows,
  };
}

export async function duplicatePostForUser(
  userId: string,
  postId: string,
): Promise<{ postId: string; status: "draft" }> {
  await requireWorkspacePermission(userId, "posts:duplicate");
  const source = await loadPostReusableContent(userId, postId);
  return createDraftFromReusableContent({ userId, ...source });
}

function templateMedia(row: typeof contentTemplates.$inferSelect): TemplateMediaSummary | null {
  if (!row.mediaStorageKey && !row.mediaSourceUrl) return null;
  return {
    id: row.id,
    mediaType: row.mediaType ?? "image",
    mimeType: row.mimeType ?? "application/octet-stream",
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    duration: row.duration,
    previewUrl: null,
  };
}

async function toTemplateSummary(
  row: typeof contentTemplates.$inferSelect,
): Promise<ContentTemplateSummary> {
  const media = templateMedia(row);
  if (media && row.mediaStorageKey) {
    try {
      media.previewUrl = await createSignedMediaUrl(row.mediaStorageKey);
    } catch {
      media.previewUrl = null;
    }
  }

  return {
    id: row.id,
    name: row.name,
    contentText: row.contentText,
    platforms: [...new Set((row.targets ?? []).map((target) => target.platform))],
    media,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getTemplateRow(userId: string, templateId: string) {
  const workspaceId = await getActiveWorkspaceId(userId);
  const [row] = await db
    .select()
    .from(contentTemplates)
    .where(and(eq(contentTemplates.id, templateId), eq(contentTemplates.userId, userId), eq(contentTemplates.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new AppError("not_found", "We couldn't find that template.");
  return row;
}

export async function listTemplatesForUser(userId: string): Promise<ContentTemplateSummary[]> {
  const workspaceId = await getActiveWorkspaceId(userId);
  const rows = await db
    .select()
    .from(contentTemplates)
    .where(and(eq(contentTemplates.userId, userId), eq(contentTemplates.workspaceId, workspaceId)))
    .orderBy(desc(contentTemplates.updatedAt))
    .limit(100);
  return Promise.all(rows.map(toTemplateSummary));
}

export async function getTemplateForUser(
  userId: string,
  templateId: string,
): Promise<ContentTemplateDetail> {
  return toTemplateSummary(await getTemplateRow(userId, templateId));
}

function templateTargets(platforms: readonly Platform[]): TemplateTarget[] {
  return platforms.map((platform) => ({ platform, socialAccountId: null }));
}

export async function createTemplateForUser(
  userId: string,
  input: TemplateInput,
): Promise<ContentTemplateDetail> {
  await requireWorkspacePermission(userId, "templates:create");
  const workspaceId = await getActiveWorkspaceId(userId);
  const [created] = await db
    .insert(contentTemplates)
    .values({
      userId,
      workspaceId,
      name: input.name.trim(),
      contentText: input.caption.trim() || EMPTY_TEMPLATE_CAPTION,
      targets: templateTargets(input.platforms),
    })
    .returning();
  return toTemplateSummary(created);
}

export async function updateTemplateForUser(
  userId: string,
  templateId: string,
  input: Partial<TemplateInput>,
): Promise<ContentTemplateDetail> {
  await requireWorkspacePermission(userId, "templates:update");
  const existing = await getTemplateRow(userId, templateId);
  const [updated] = await db
    .update(contentTemplates)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.caption !== undefined ? { contentText: input.caption.trim() } : {}),
      ...(input.platforms !== undefined ? { targets: templateTargets(input.platforms) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(contentTemplates.id, existing.id))
    .returning();
  return toTemplateSummary(updated);
}

export async function deleteTemplateForUser(userId: string, templateId: string): Promise<void> {
  await requireWorkspacePermission(userId, "templates:delete");
  const existing = await getTemplateRow(userId, templateId);
  await db.delete(contentTemplates).where(eq(contentTemplates.id, existing.id));
  await cleanupUnreferencedMedia(userId, [existing.mediaStorageKey]);
}

export async function createDraftFromTemplateForUser(
  userId: string,
  templateId: string,
): Promise<{ postId: string; status: "draft" }> {
  await requireWorkspacePermission(userId, "templates:use");
  const template = await getTemplateRow(userId, templateId);
  return createDraftFromReusableContent({
    userId,
    contentText: template.contentText,
    media: mediaFromTemplate(template),
    targets: template.targets ?? [],
  });
}

export async function savePostAsTemplateForUser(
  userId: string,
  postId: string,
  name: string,
): Promise<ContentTemplateDetail> {
  await requireWorkspacePermission(userId, "templates:create");
  const workspaceId = await getActiveWorkspaceId(userId);
  const source = await loadPostReusableContent(userId, postId);
  const targets = await resolveReusableTargets(userId, source.targets);
  const [created] = await db
    .insert(contentTemplates)
    .values({
      userId,
      workspaceId,
      name: name.trim(),
      contentText: source.contentText,
      mediaStorageKey: source.media?.storageKey ?? null,
      mediaSourceUrl: source.media?.sourceUrl ?? null,
      mediaType: source.media?.mediaType ?? null,
      mimeType: source.media?.mimeType ?? null,
      fileSize: source.media?.fileSize ?? null,
      width: source.media?.width ?? null,
      height: source.media?.height ?? null,
      duration: source.media?.duration ?? null,
      targets,
    })
    .returning();
  return toTemplateSummary(created);
}
