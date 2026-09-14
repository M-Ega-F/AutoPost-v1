import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth/server";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { uploadMediaObject } from "@/lib/storage";
import { fetchMediaFromUrl } from "@/lib/media/fetch-url";
import { extensionForMimeType, probeMedia } from "@/lib/media/probe";
import { mimeTypeToMediaType } from "@/lib/validation/limits";
import { mediaUrlSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_RATE_LIMITED = "Too many attempts. Wait a moment and try again.";
const MESSAGE_UNAUTHORIZED = "Please log in to continue.";
const MESSAGE_UPLOAD_FAILED =
  "We couldn't upload this file. Check your connection and try again.";

function failure(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const status = error.code === "media_too_large" ? 413 : 400;
    return NextResponse.json({ message: error.message }, { status });
  }

  logger.error("media url route failed", {
    error: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json({ message: MESSAGE_UPLOAD_FAILED }, { status: 500 });
}

function fileNameFor(url: URL, mimeType: string): string {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop() ?? "";

  let base: string;
  try {
    base = decodeURIComponent(lastSegment);
  } catch {
    base = lastSegment;
  }

  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  if (cleaned && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(cleaned)) return cleaned;

  return `media.${extensionForMimeType(mimeType)}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ message: MESSAGE_UNAUTHORIZED }, { status: 401 });
    }
    await requireWorkspacePermission(userId, "media:create");

    const limited = consumeRateLimit("mediaUrl", userId);
    if (!limited.ok) {
      return NextResponse.json(
        { message: MESSAGE_RATE_LIMITED },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = mediaUrlSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid media URL.";
      return NextResponse.json({ message }, { status: 400 });
    }

    const target = new URL(parsed.data.url);
    const media = await fetchMediaFromUrl(parsed.data.url);

    const mediaType = mimeTypeToMediaType(media.mimeType);
    if (!mediaType) {
      return NextResponse.json(
        {
          message:
            "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.",
        },
        { status: 400 },
      );
    }

    const probe = probeMedia(media.bytes, media.mimeType);

    // Persist it: a scheduled post must never depend on a temporary URL.
    const stored = await uploadMediaObject(userId, {
      name: fileNameFor(target, media.mimeType),
      type: media.mimeType,
      size: media.size,
      bytes: media.bytes,
    });

    return NextResponse.json(
      {
        storageKey: stored.storageKey,
        sourceUrl: target.toString(),
        mediaType,
        mimeType: media.mimeType,
        fileSize: stored.fileSize ?? media.size,
        width: probe.width,
        height: probe.height,
        duration: probe.duration,
      },
      { status: 200 },
    );
  } catch (error) {
    return failure(error);
  }
}
