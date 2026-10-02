"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/server";
import { AppError, errorMessageForUser } from "@/lib/errors";
import { logger, sanitize } from "@/lib/logger";
import { perfLoggingEnabled, withPerfRequest } from "@/lib/perf";
import { createPublishTraceId, logPublishTrace } from "@/lib/publishing/trace";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  cancelPostForUser,
  createPostForUser,
  deleteDraftForUser,
  publishDraftForUser,
  saveDraftForUser,
  retryPostPlatformForUser,
} from "@/lib/services/posts";
import { createPostSchema, saveDraftSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/domain/types";
import type { Platform, PostStatus } from "@/lib/status";
import type { YouTubePostSettings } from "@/lib/youtube";

export type CreatePostMediaPayload =
  | {
      kind: "upload";
      storageKey: string;
      mediaType: "image" | "video";
      mimeType: string;
      fileSize: number | null;
      width: number | null;
      height: number | null;
      duration: number | null;
    }
  | {
      kind: "url";
      sourceUrl: string;
      storageKey: string;
      mediaType: "image" | "video";
      mimeType: string;
      fileSize: number | null;
      width: number | null;
      height: number | null;
      duration: number | null;
    }
  | {
      kind: "library";
      assetId: string;
      storageKey: null;
      sourceUrl?: null;
      mediaType: "image" | "video";
      mimeType: string;
      fileSize: number | null;
      width: number | null;
      height: number | null;
      duration: number | null;
    };

export type CreatePostPayload = {
  contentText: string;
  media: CreatePostMediaPayload;
  targets: Array<{ platform: Platform; socialAccountId: string }>;
  schedule: { date: string; time: string; timezone: string } | null;
  campaignId?: string | null;
  youtube?: YouTubePostSettings | null;
};

export type DraftPayload = {
  postId?: string;
  caption: string;
  media: CreatePostMediaPayload | null;
  targets: Array<{ platform: Platform; socialAccountId: string }>;
  timezone: string;
  campaignId?: string | null;
  youtube?: YouTubePostSettings | null;
};

type PostActionResult = ActionResult & { postId?: string; status?: PostStatus };

function normalizeMedia(media: CreatePostMediaPayload | null | undefined) {
  if (!media) return null;
  return {
    ...media,
    sourceUrl: media.kind === "url" ? media.sourceUrl : null,
    assetId: media.kind === "library" ? media.assetId : null,
  };
}

function fail(error: unknown, fallback: string): ActionResult {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  return { ok: false, message: errorMessageForUser(error, fallback) };
}

function diagnosticError(error: unknown): {
  errorName: string;
  errorMessage: string;
} {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const safeName = sanitize(name);
  const safeMessage = sanitize(message);

  return {
    errorName:
      typeof safeName === "string" ? safeName.slice(0, 120) : "UnknownError",
    errorMessage:
      typeof safeMessage === "string"
        ? safeMessage.slice(0, 500)
        : "[unavailable]",
  };
}

export async function createPostAction(
  payload: CreatePostPayload,
): Promise<PostActionResult> {
  const publishTraceId = createPublishTraceId();
  logPublishTrace(publishTraceId, "PUBLISH_REQUEST", {
    operation: payload?.schedule ? "schedule" : "publish",
  });
  return withPerfRequest("POST /create-post", () =>
    createPostActionInternal(payload, publishTraceId),
  );
}

async function createPostActionInternal(
  payload: CreatePostPayload,
  publishTraceId: string,
): Promise<PostActionResult> {
  const perfStartedAt = Date.now();
  const userId = await requireUserId();

  const limited = consumeRateLimit(
    payload?.schedule ? "schedule" : "publishNow",
    userId,
  );
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many posts at once. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  try {
    const parsed = createPostSchema.safeParse({
      caption: payload?.contentText,
      media: normalizeMedia(payload?.media),
      targets: payload?.targets,
      schedule: payload?.schedule,
      campaignId: payload?.campaignId,
      youtube: payload?.youtube,
    });

    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid post." };
    }

    const result = await createPostForUser(userId, parsed.data, publishTraceId);

    revalidatePath("/dashboard");
    revalidatePath("/scheduled");
    revalidatePath("/history");

    if (perfLoggingEnabled()) {
      logger.info("[PERF][createPostAction]", {
        durationMs: Date.now() - perfStartedAt,
        targetCount: parsed.data.targets.length,
        status: result.status,
      });
    }

    return { ok: true, postId: result.postId, status: result.status };
  } catch (error) {
    return fail(error, "We couldn't create this post. Try again.");
  }
}

export async function saveDraftAction(
  payload: DraftPayload,
): Promise<PostActionResult> {
  const userId = await requireUserId();
  const limited = consumeRateLimit("saveDraft", userId);
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many saves at once. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  try {
    const parsed = saveDraftSchema.safeParse({
      postId: payload?.postId,
      caption: payload?.caption,
      media: normalizeMedia(payload?.media),
      targets: payload?.targets,
      timezone: payload?.timezone,
      campaignId: payload?.campaignId,
      youtube: payload?.youtube,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid draft." };
    }

    const result = await saveDraftForUser(userId, {
      ...parsed.data,
      postId: payload?.postId,
    });
    revalidatePath("/drafts");
    revalidatePath(`/drafts/${result.postId}`);
    return { ok: true, postId: result.postId, status: result.status };
  } catch (error) {
    return fail(error, "We couldn't save this draft. Try again.");
  }
}

export async function publishDraftAction(
  postId: string,
  payload: CreatePostPayload,
): Promise<PostActionResult> {
  logger.info("[PUBLISH-ENTRY]", {
    postId,
    targetCount: Array.isArray(payload?.targets) ? payload.targets.length : 0,
    timestamp: new Date().toISOString(),
  });
  const publishTraceId = createPublishTraceId();
  logPublishTrace(publishTraceId, "PUBLISH_REQUEST", {
    operation: payload?.schedule ? "schedule-draft" : "publish-draft",
    postId,
  });
  const userId = await requireUserId();
  const limited = consumeRateLimit(
    payload?.schedule ? "schedule" : "publishNow",
    userId,
  );
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many posts at once. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  try {
    const parsed = createPostSchema.safeParse({
      caption: payload?.contentText,
      media: normalizeMedia(payload?.media),
      targets: payload?.targets,
      schedule: payload?.schedule,
      campaignId: payload?.campaignId,
      youtube: payload?.youtube,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid post." };
    }
    const result = await publishDraftForUser(userId, postId, parsed.data, publishTraceId);
    logger.info("[PUBLISH-DIAGNOSTIC]", {
      marker: "REVALIDATE_START",
      postId,
      publishTraceId,
    });
    revalidatePath("/drafts");
    revalidatePath(`/drafts/${postId}`);
    revalidatePath("/dashboard");
    revalidatePath("/scheduled");
    revalidatePath("/history");
    logger.info("[PUBLISH-DIAGNOSTIC]", {
      marker: "REVALIDATE_SUCCESS",
      postId,
      publishTraceId,
    });
    return { ok: true, postId: result.postId, status: result.status };
  } catch (error) {
    logger.error("[PUBLISH-DIAGNOSTIC]", {
      marker: "PUBLISH_ACTION_FAILED",
      postId,
      publishTraceId,
      ...diagnosticError(error),
    });
    return fail(error, "We couldn't publish this draft. Try again.");
  }
}

export async function deleteDraftAction(postId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  try {
    await deleteDraftForUser(userId, postId);
    revalidatePath("/drafts");
    revalidatePath(`/drafts/${postId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, "We couldn't delete this draft. Try again.");
  }
}

export async function cancelPostAction(postId: string): Promise<ActionResult> {
  return withPerfRequest("SERVER_ACTION cancelPostAction", () => cancelPostActionInternal(postId));
}

async function cancelPostActionInternal(postId: string): Promise<ActionResult> {
  const userId = await requireUserId();

  const limited = consumeRateLimit("cancel", userId);
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many attempts. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  try {
    await cancelPostForUser(userId, postId);
    revalidatePath("/dashboard");
    revalidatePath("/scheduled");
    revalidatePath("/history");
    return { ok: true };
  } catch (error) {
    return fail(error, "Couldn't cancel this post. Try again.");
  }
}

export async function retryPlatformAction(
  postPlatformId: string,
): Promise<ActionResult> {
  return withPerfRequest("SERVER_ACTION retryPlatformAction", () => retryPlatformActionInternal(postPlatformId));
}

async function retryPlatformActionInternal(
  postPlatformId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const limited = consumeRateLimit("retry", userId);
  if (!limited.ok) {
    return {
      ok: false,
      message: "Too many attempts. Wait a moment and try again.",
      code: "rate_limited_action",
    };
  }

  try {
    await retryPostPlatformForUser(userId, postPlatformId);
    revalidatePath("/dashboard");
    revalidatePath("/history");
    return { ok: true };
  } catch (error) {
    return fail(error, "We couldn't retry this platform. Try again.");
  }
}
