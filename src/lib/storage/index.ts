import "server-only";

import { serverConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getServiceSupabase } from "@/lib/auth/service";
import { logger } from "@/lib/logger";

export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type StoredObject = {
  storageKey: string;
  fileSize: number | null;
  mimeType: string;
};

function bucket() {
  return serverConfig.mediaBucket;
}

function storageKeyFor(userId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${userId}/${stamp}-${random}-${safeName}`;
}

export async function ensureMediaBucket(): Promise<void> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.getBucket(bucket());

  if (!error && data) return;

  if (error) {
    logger.warn("media bucket lookup failed", {
      bucket: bucket(),
      status: error.status ?? null,
      name: error.name ?? null,
      message: error.message,
    });
  }

  const { error: createError } = await supabase.storage.createBucket(bucket(), {
    public: false,
    fileSizeLimit: "100MB",
  });

  if (createError && !/already exists/i.test(createError.message)) {
    logger.error("media bucket preparation failed", {
      bucket: bucket(),
      status: createError.status ?? null,
      name: createError.name ?? null,
      message: createError.message,
    });
    throw new AppError(
      "server_error",
      "We couldn't prepare media storage. Try again.",
    );
  }
}

export async function uploadMediaObject(
  userId: string,
  file: { name: string; type: string; size: number; bytes: Uint8Array },
): Promise<StoredObject> {
  await ensureMediaBucket();

  const storageKey = storageKeyFor(userId, file.name);
  const supabase = getServiceSupabase();

  const { error } = await supabase.storage
    .from(bucket())
    .upload(storageKey, file.bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    logger.error("media upload failed", { userId, message: error.message });
    throw new AppError(
      "server_error",
      "We couldn't upload this file. Check your connection and try again.",
    );
  }

  return { storageKey, fileSize: file.size, mimeType: file.type };
}

export async function removeMediaObject(storageKey: string): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage.from(bucket()).remove([storageKey]);
  if (error) {
    logger.warn("media delete failed", { message: error.message });
  }
}

/**
 * A short-lived URL for a persistently stored object. The object itself is the
 * source of truth; the URL is generated at publish time, never persisted as the
 * post's media reference.
 */
export async function createSignedMediaUrl(
  storageKey: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(bucket())
    .createSignedUrl(storageKey, expiresIn);

  if (error || !data?.signedUrl) {
    throw new AppError(
      "server_error",
      "We couldn't read this media file. Try uploading it again.",
    );
  }

  return data.signedUrl;
}

export async function downloadMediaObject(
  storageKey: string,
): Promise<{ bytes: Uint8Array; mimeType: string | null; size: number }> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(bucket()).download(storageKey);

  if (error || !data) {
    throw new AppError(
      "server_error",
      "We couldn't read this media file. Try uploading it again.",
    );
  }

  const buffer = new Uint8Array(await data.arrayBuffer());
  return { bytes: buffer, mimeType: data.type || null, size: buffer.byteLength };
}
