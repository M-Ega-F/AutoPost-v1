"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth/server";
import { AppError, PLATFORM_LABELS, errorMessageForUser } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { listActiveAccounts } from "@/lib/domain/accounts";
import {
  cancelScheduledPost,
  createPost,
  retryPlatform,
} from "@/lib/domain/posts";
import { zonedTimeToUtc } from "@/lib/time";
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
    payload.schedule ? "schedule" : "publishNow",
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
    const caption = payload.contentText.trim();
    if (!caption) {
      return { ok: false, message: "Write a caption before publishing." };
    }

    if (payload.platforms.length === 0) {
      return { ok: false, message: "Select at least one platform." };
    }

    if (!payload.media?.storageKey) {
      return { ok: false, message: "Add media before publishing." };
    }

    const accounts = await listActiveAccounts(userId);
    const byplatform = new Map(accounts.map((account) => [account.platform, account]));

    const targets: Array<{ platform: Platform; socialAccountId: string }> = [];
    for (const platform of payload.platforms) {
      const account = byplatform.get(platform);
      if (!account) {
        return {
          ok: false,
          message: `Your ${
            PLATFORM_LABELS[platform] ?? "This platform"
          } account is no longer connected.`,
          code: "forbidden",
        };
      }
      targets.push({ platform, socialAccountId: account.id });
    }

    const scheduledAt = payload.schedule
      ? zonedTimeToUtc(
          payload.schedule.date,
          payload.schedule.time,
          payload.schedule.timezone,
        )
      : null;

    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      return { ok: false, message: "Choose a time in the future." };
    }

    const timezone = payload.schedule?.timezone ?? "UTC";

    const result = await createPost({
      userId,
      contentText: caption,
      timezone,
      scheduledAt,
      media: {
        storageKey: payload.media.storageKey,
        sourceUrl: payload.media.kind === "url" ? payload.media.sourceUrl : null,
        mediaType: payload.media.mediaType,
        mimeType: payload.media.mimeType,
        fileSize: payload.media.fileSize,
        width: payload.media.width,
        height: payload.media.height,
        duration: payload.media.duration,
      },
      targets,
    });

    revalidatePath("/dashboard");
    revalidatePath("/scheduled");
    revalidatePath("/history");

    return { ok: true, postId: result.postId };
  } catch (error) {
    return fail(error, "We couldn't create this post. Try again.");
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
    await cancelScheduledPost(userId, postId);
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
    await retryPlatform(userId, postPlatformId);
    revalidatePath("/dashboard");
    revalidatePath("/history");
    return { ok: true };
  } catch (error) {
    return fail(error, "We couldn't retry this platform. Try again.");
  }
}
