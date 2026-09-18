import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { AppError } from "@/lib/errors";
import { probeMedia, sniffMimeType } from "@/lib/media/probe";
import { logger } from "@/lib/logger";
import { downloadMediaObject } from "@/lib/storage";
import {
  isAcceptedMediaExtension,
  isAcceptedMediaMimeHint,
  isMediaStorageKeyForUser,
} from "@/lib/media/upload-contract";
import { MAX_UPLOAD_BYTES, mimeTypeToMediaType } from "@/lib/validation/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_UNSUPPORTED =
  "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";
const MESSAGE_TOO_LARGE = `This file is too large. Maximum size is ${Math.round(
  MAX_UPLOAD_BYTES / (1024 * 1024),
)} MB.`;
const MESSAGE_SIZE_MISMATCH = "The uploaded file changed. Please try again.";

const finalizeSchema = z.object({
  storageKey: z.string().trim().min(1).max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(128).nullable(),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

function responseFor(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const status =
      error.code === "media_too_large"
        ? 413
        : error.code === "server_error"
          ? 500
          : 400;
    return NextResponse.json({ message: error.message }, { status });
  }

  logger.error("media upload finalize failed", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return NextResponse.json(
    { message: "We couldn't upload this file. Check your connection and try again." },
    { status: 500 },
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { message: "Please log in to continue." },
        { status: 401 },
      );
    }
    await requireWorkspacePermission(userId, "media:create");

    const parsed = finalizeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Media upload is incomplete." },
        { status: 400 },
      );
    }

    const { storageKey, fileName, mimeType: mimeHint, fileSize: expectedSize } = parsed.data;
    if (!isMediaStorageKeyForUser(storageKey, userId)) {
      return NextResponse.json({ message: "Media upload is not authorized." }, { status: 403 });
    }
    if (!isAcceptedMediaExtension(fileName) || !isAcceptedMediaMimeHint(mimeHint)) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const stored = await downloadMediaObject(storageKey);
    if (stored.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: MESSAGE_TOO_LARGE }, { status: 413 });
    }
    if (expectedSize !== stored.size) {
      return NextResponse.json({ message: MESSAGE_SIZE_MISMATCH }, { status: 400 });
    }

    const mimeType = sniffMimeType(stored.bytes);
    if (!mimeType) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const mediaType = mimeTypeToMediaType(mimeType);
    if (!mediaType) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const probe = probeMedia(stored.bytes, mimeType);
    return NextResponse.json(
      {
        storageKey,
        mediaType,
        mimeType,
        fileSize: stored.size,
        width: probe.width,
        height: probe.height,
        duration: probe.duration,
      },
      { status: 200 },
    );
  } catch (error) {
    return responseFor(error);
  }
}
