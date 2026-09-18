import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserId } from "@/lib/auth/server";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createMediaUploadIntent } from "@/lib/storage";
import {
  isAcceptedMediaExtension,
  isAcceptedMediaMimeHint,
} from "@/lib/media/upload-contract";
import { MAX_UPLOAD_BYTES } from "@/lib/validation/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_UNSUPPORTED =
  "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";

const uploadIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(128).nullable(),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

function responseFor(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const status = error.code === "server_error" ? 500 : 400;
    return NextResponse.json({ message: error.message }, { status });
  }

  logger.error("media upload intent failed", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return NextResponse.json(
    { message: "We couldn't prepare the media upload. Try again." },
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

    const parsed = uploadIntentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Choose a valid image or video file." },
        { status: 400 },
      );
    }

    const { fileName, mimeType } = parsed.data;
    if (!isAcceptedMediaExtension(fileName) || !isAcceptedMediaMimeHint(mimeType)) {
      return NextResponse.json({ message: MESSAGE_UNSUPPORTED }, { status: 400 });
    }

    const intent = await createMediaUploadIntent(userId, fileName);
    return NextResponse.json(intent, { status: 200 });
  } catch (error) {
    return responseFor(error);
  }
}
