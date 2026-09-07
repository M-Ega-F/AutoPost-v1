import type { Platform } from "@/lib/status";

// Supabase Free projects enforce a 50 MiB global Storage limit. This remains
// configurable for plans/projects that permit a larger global limit.
const DEFAULT_MAX_UPLOAD_MB = 50;
const configuredMaxUploadMb = Number(process.env.NEXT_PUBLIC_MEDIA_MAX_UPLOAD_MB);
const MAX_UPLOAD_MB =
  Number.isInteger(configuredMaxUploadMb) && configuredMaxUploadMb > 0
    ? configuredMaxUploadMb
    : DEFAULT_MAX_UPLOAD_MB;

export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_REMOTE_DOWNLOAD_BYTES = MAX_UPLOAD_BYTES;
export const REMOTE_FETCH_TIMEOUT_MS = 15_000;

export const ACCEPTED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
] as const;

export const ACCEPTED_UPLOAD_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".mp4",
  ".mov",
] as const;

export const UPLOAD_HINT =
  `JPEG, PNG, WebP, MP4 or MOV · up to ${MAX_UPLOAD_MB} MB`;

export type PlatformLimits = {
  /** Maximum caption length in characters. */
  captionLength: number;
  /** Maximum media size in bytes. */
  maxBytes: number;
  imageMimeTypes: readonly string[];
  videoMimeTypes: readonly string[];
  minDurationSec?: number;
  maxDurationSec?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
};

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_MIME = ["video/mp4", "video/quicktime"] as const;

export const PLATFORM_LIMITS: Record<Platform, PlatformLimits> = {
  instagram: {
    captionLength: 2_200,
    maxBytes: 100 * 1024 * 1024,
    imageMimeTypes: IMAGE_MIME,
    videoMimeTypes: VIDEO_MIME,
    minDurationSec: 3,
    maxDurationSec: 90,
    minWidth: 320,
    minHeight: 320,
    maxWidth: 4096,
    maxHeight: 4096,
  },
  facebook: {
    captionLength: 63_206,
    maxBytes: 100 * 1024 * 1024,
    imageMimeTypes: IMAGE_MIME,
    videoMimeTypes: VIDEO_MIME,
    minDurationSec: 1,
    maxDurationSec: 600,
    minWidth: 200,
    minHeight: 200,
  },
  tiktok: {
    captionLength: 2_200,
    maxBytes: 100 * 1024 * 1024,
    imageMimeTypes: IMAGE_MIME,
    videoMimeTypes: VIDEO_MIME,
    minDurationSec: 3,
    maxDurationSec: 600,
    minWidth: 200,
    minHeight: 200,
  },
  threads: {
    captionLength: 500,
    maxBytes: 100 * 1024 * 1024,
    imageMimeTypes: IMAGE_MIME,
    videoMimeTypes: VIDEO_MIME,
    minDurationSec: 1,
    maxDurationSec: 300,
    minWidth: 200,
    minHeight: 200,
  },
  linkedin: {
    captionLength: 3_000,
    maxBytes: 100 * 1024 * 1024,
    imageMimeTypes: IMAGE_MIME,
    videoMimeTypes: VIDEO_MIME,
    minWidth: 1,
    minHeight: 1,
  },
  x: {
    captionLength: 280,
    maxBytes: 50 * 1024 * 1024,
    imageMimeTypes: IMAGE_MIME,
    videoMimeTypes: VIDEO_MIME,
    minWidth: 1,
    minHeight: 1,
  },
};

export function captionLimitFor(platforms: readonly Platform[]): number {
  if (platforms.length === 0) return 2_200;
  return Math.min(...platforms.map((platform) => PLATFORM_LIMITS[platform].captionLength));
}

/** The platforms that constrain the current caption limit, for the hint text. */
export function captionLimitConstrainers(
  platforms: readonly Platform[],
  limit: number,
): Platform[] {
  return platforms.filter(
    (platform) => PLATFORM_LIMITS[platform].captionLength === limit,
  );
}

export function mimeTypeToMediaType(mimeType: string): "image" | "video" | null {
  if ((IMAGE_MIME as readonly string[]).includes(mimeType)) return "image";
  if ((VIDEO_MIME as readonly string[]).includes(mimeType)) return "video";
  return null;
}
