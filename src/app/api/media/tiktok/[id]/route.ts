import "server-only";

import { eq } from "drizzle-orm";

import { db, postMedia } from "@/lib/db";
import { sniffMimeType } from "@/lib/media/probe";
import {
  verifyTikTokPhotoDeliveryToken,
} from "@/lib/media/tiktok-photo-delivery";
import { downloadMediaObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type TikTokPhotoMediaRecord = {
  mediaType: string;
  mimeType: string;
  storageKey: string | null;
};

const TIKTOK_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/webp"]);

type TikTokPhotoDeliveryDependencies = {
  findMedia: (id: string) => Promise<TikTokPhotoMediaRecord | undefined>;
  download: typeof downloadMediaObject;
};

function errorResponse(status: number): Response {
  return Response.json(
    { error: "Media is unavailable." },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

const defaultDependencies: TikTokPhotoDeliveryDependencies = {
  findMedia: async (id) => {
    const [media] = await db
      .select({
        mediaType: postMedia.mediaType,
        mimeType: postMedia.mimeType,
        storageKey: postMedia.storageKey,
      })
      .from(postMedia)
      .where(eq(postMedia.id, id))
      .limit(1);
    return media;
  },
  download: downloadMediaObject,
};

export async function handleTikTokPhotoGet(
  request: Request,
  id: string,
  dependencies: TikTokPhotoDeliveryDependencies = defaultDependencies,
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");

  if (!token || !verifyTikTokPhotoDeliveryToken(token, id)) {
    return errorResponse(401);
  }

  const media = await dependencies.findMedia(id);

  if (
    !media ||
    media.mediaType !== "image" ||
    !TIKTOK_PHOTO_MIME_TYPES.has(media.mimeType.toLowerCase()) ||
    !media.storageKey
  ) {
    return errorResponse(404);
  }

  let stored: Awaited<ReturnType<typeof downloadMediaObject>>;
  try {
    stored = await dependencies.download(media.storageKey);
  } catch {
    return errorResponse(503);
  }

  const contentType = sniffMimeType(stored.bytes);
  if (
    !contentType ||
    !TIKTOK_PHOTO_MIME_TYPES.has(contentType) ||
    contentType !== media.mimeType.toLowerCase()
  ) {
    return errorResponse(404);
  }

  const body = stored.bytes.buffer.slice(
    stored.bytes.byteOffset,
    stored.bytes.byteOffset + stored.bytes.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": String(stored.bytes.byteLength),
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const { id } = await params;
  return handleTikTokPhotoGet(request, id);
}
