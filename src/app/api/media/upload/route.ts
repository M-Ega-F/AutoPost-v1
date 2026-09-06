import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { uploadMediaObject } from "@/lib/storage";
import { extensionForMimeType, probeMedia, sniffMimeType } from "@/lib/media/probe";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  mimeTypeToMediaType,
} from "@/lib/validation/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_UNSUPPORTED =
  "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";
const MESSAGE_TOO_LARGE = `This file is too large. Maximum size is ${Math.round(
  MAX_UPLOAD_BYTES / (1024 * 1024),
)} MB.`;
const MESSAGE_UPLOAD_FAILED =
  "We couldn't upload this file. Check your connection and try again.";
const MESSAGE_RATE_LIMITED = "Too many uploads. Wait a moment and try again.";
const MESSAGE_UNAUTHORIZED = "Please log in to continue.";

function failure(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const status =
      error.code === "media_too_large"
        ? 413
        : error.code === "rate_limited_action"
          ? 429
          : 400;
    return NextResponse.json({ message: error.message }, { status });
  }

  logger.error("media upload route failed", {
    error: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json({ message: MESSAGE_UPLOAD_FAILED }, { status: 500 });
}

/** Keeps a sane filename for storage; the extension follows the real type. */
function fileNameFor(rawName: string, mimeType: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  const hasAcceptedExtension = (ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).some(
    (extension) => cleaned.toLowerCase().endsWith(extension),
  );

  if (cleaned && hasAcceptedExtension) return cleaned;
  if (cleaned && /\.[a-z0-9]{1,5}$/i.test(cleaned)) {
    return `${cleaned.replace(/\.[a-z0-9]{1,5}$/i, "")}.${extensionForMimeType(mimeType)}`;
  }

  return `upload.${extensionForMimeType(mimeType)}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ message: MESSAGE_UNAUTHORIZED }, { status: 401 });
    }

    const limited = consumeRateLimit("mediaUpload", userId);
    if (!limited.ok) {
      return NextResponse.json(
        { message: MESSAGE_RATE_LIMITED },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: MESSAGE_TOO_LARGE }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: MESSAGE_TOO_LARGE }, { status: 413 });
    }

    // The client's `type` is only a hint: magic bytes decide, and the extension
    // is a secondary signal that must agree with an accepted type when present.
    const mimeType = sniffMimeType(bytes);
    if (!mimeType) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const name = file.name ?? "";
    const extension = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase()}` : "";
    if (extension && !(ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const mediaType = mimeTypeToMediaType(mimeType);
    if (!mediaType) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const probe = probeMedia(bytes, mimeType);

    const stored = await uploadMediaObject(userId, {
      name: fileNameFor(name, mimeType),
      type: mimeType,
      size: bytes.byteLength,
      bytes,
    });

    return NextResponse.json(
      {
        storageKey: stored.storageKey,
        mediaType,
        mimeType,
        fileSize: stored.fileSize ?? bytes.byteLength,
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
