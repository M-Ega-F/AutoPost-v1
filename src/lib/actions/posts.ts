"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/server";
import { AppError, errorMessageForUser } from "@/lib/errors";
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
import type { Platform } from "@/lib/status";

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
    };

export type CreatePostPayload = {
  contentText: string;
  media: CreatePostMediaPayload;
  /** Platform names only — the server resolves the connected account itself. */
  platforms: Platform[];
  schedule: { date: string; time: string; timezone: string } | null;
};

export type DraftPayload = {
  postId?: string;
  caption: string;
  media: CreatePostMediaPayload | null;
  platforms: Platform[];
  timezone: string;
};

function normalizeMedia(media: CreatePostMediaPayload | null | undefined) {
  if (!media) return null;
  return {
    ...media,
    sourceUrl: media.kind === "url" ? media.sourceUrl : null,
  };
}

function fail(error: unknown, fallback: string): ActionResult {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  return { ok: false, message: errorMessageForUser(error, fallback) };
}

export async function createPostAction(
  payload: CreatePostPayload,
): Promise<ActionResult & { postId?: string }> {
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
      platforms: payload?.platforms,
      schedule: payload?.schedule,
    });

    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid post." };
    }

    const result = await createPostForUser(userId, parsed.data);

    revalidatePath("/dashboard");
    revalidatePath("/scheduled");
    revalidatePath("/history");

    return { ok: true, postId: result.postId };
  } catch (error) {
    return fail(error, "We couldn't create this post. Try again.");
  }
}

export async function saveDraftAction(
  payload: DraftPayload,
): Promise<ActionResult & { postId?: string }> {
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
      platforms: payload?.platforms,
      timezone: payload?.timezone,
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
    return { ok: true, postId: result.postId };
  } catch (error) {
    return fail(error, "We couldn't save this draft. Try again.");
  }
}

export async function publishDraftAction(
  postId: string,
  payload: CreatePostPayload,
): Promise<ActionResult & { postId?: string }> {
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
      platforms: payload?.platforms,
      schedule: payload?.schedule,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid post." };
    }
    const result = await publishDraftForUser(userId, postId, parsed.data);
    revalidatePath("/drafts");
    revalidatePath(`/drafts/${postId}`);
    revalidatePath("/dashboard");
    revalidatePath("/scheduled");
    revalidatePath("/history");
    return { ok: true, postId: result.postId };
  } catch (error) {
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
