import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth/server";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { apiError, apiErrorFromUnknown, apiSuccess } from "@/lib/api/response";
import { createMediaForUser, listMediaForUser } from "@/lib/services/media";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { probeMedia, sniffMimeType, extensionForMimeType } from "@/lib/media/probe";
import { consumeRateLimit } from "@/lib/rate-limit";
import { removeMediaObject, uploadMediaObject } from "@/lib/storage";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  mimeTypeToMediaType,
} from "@/lib/validation/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_MESSAGE = "We couldn't upload this file. Check your connection and try again.";

function fileNameFor(rawName: string, mimeType: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-160);
  const hasAcceptedExtension = (ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).some(
    (extension) => cleaned.toLowerCase().endsWith(extension),
  );
  if (cleaned && hasAcceptedExtension) return cleaned;
  if (cleaned && /\.[a-z0-9]{1,5}$/i.test(cleaned)) {
    return `${cleaned.replace(/\.[a-z0-9]{1,5}$/i, "")}.${extensionForMimeType(mimeType)}`;
  }
  return `upload.${extensionForMimeType(mimeType)}`;
}

function numberParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });

  const url = new URL(request.url);
  const rawType = url.searchParams.get("type");
  const mediaType = rawType === "image" || rawType === "video" ? rawType : undefined;
  try {
    const result = await listMediaForUser(userId, {
      page: numberParam(url.searchParams.get("page"), 1),
      pageSize: numberParam(url.searchParams.get("pageSize"), 24),
      search: url.searchParams.get("search")?.slice(0, 80) ?? undefined,
      mediaType,
    });

    return apiSuccess({ assets: result.items, pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    } });
  } catch (error) {
    return apiErrorFromUnknown(error, "We couldn't load your media library. Try again.");
  }
}

export async function POST(request: Request): Promise<Response> {
  let storageKey: string | null = null;
  try {
    const userId = await getUserId();
    if (!userId) return apiError({ status: 401, code: "UNAUTHORIZED", message: "Please log in to continue." });
    await requireWorkspacePermission(userId, "media:create");

    const limited = consumeRateLimit("mediaUpload", userId);
    if (!limited.ok) {
      return NextResponse.json(
        { message: "Too many uploads. Wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ message: "Choose an image or video file." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: `This file is too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniffMimeType(bytes);
    const mediaType = mimeType ? mimeTypeToMediaType(mimeType) : null;
    const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : "";
    if (!mimeType || !mediaType || (extension && !(ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension))) {
      return NextResponse.json({ message: "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV." }, { status: 400 });
    }

    const probe = probeMedia(bytes, mimeType);
    const stored = await uploadMediaObject(userId, {
      name: fileNameFor(file.name, mimeType),
      type: mimeType,
      size: bytes.byteLength,
      bytes,
    });
    storageKey = stored.storageKey;

    const asset = await createMediaForUser(userId, {
      storageKey,
      fileName: fileNameFor(file.name, mimeType),
      mimeType,
      mediaType,
      fileSize: stored.fileSize ?? bytes.byteLength,
      width: probe.width,
      height: probe.height,
      duration: probe.duration,
    });

    return apiSuccess({ asset }, 201);
  } catch (error) {
    if (storageKey) {
      try {
        await removeMediaObject(storageKey);
      } catch (cleanupError) {
        logger.warn("media library orphan cleanup failed", {
          storageKey,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }
    if (error instanceof AppError) return apiErrorFromUnknown(error, UPLOAD_MESSAGE);
    logger.error("media library upload route failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: UPLOAD_MESSAGE }, { status: 500 });
  }
}
