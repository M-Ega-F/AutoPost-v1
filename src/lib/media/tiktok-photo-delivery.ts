import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { serverConfig } from "@/lib/env";

export const TIKTOK_PHOTO_DELIVERY_PURPOSE = "tiktok-photo" as const;
export const TIKTOK_PHOTO_DELIVERY_TTL_SECONDS = 60 * 60;

type TikTokPhotoDeliveryPayload = {
  mediaId: string;
  purpose: typeof TIKTOK_PHOTO_DELIVERY_PURPOSE;
  expiresAt: number;
};

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createTikTokPhotoDeliveryToken(
  mediaId: string,
  now = nowInSeconds(),
): string {
  return encryptSecret(
    JSON.stringify({
      mediaId,
      purpose: TIKTOK_PHOTO_DELIVERY_PURPOSE,
      expiresAt: now + TIKTOK_PHOTO_DELIVERY_TTL_SECONDS,
    } satisfies TikTokPhotoDeliveryPayload),
  );
}

export function verifyTikTokPhotoDeliveryToken(
  token: string,
  mediaId: string,
  now = nowInSeconds(),
): boolean {
  try {
    const payload = JSON.parse(decryptSecret(token)) as Partial<TikTokPhotoDeliveryPayload>;
    return (
      payload.mediaId === mediaId &&
      payload.purpose === TIKTOK_PHOTO_DELIVERY_PURPOSE &&
      Number.isSafeInteger(payload.expiresAt) &&
      (payload.expiresAt as number) >= now
    );
  } catch {
    return false;
  }
}

export function createTikTokPhotoDeliveryUrl(
  mediaId: string,
  appUrl = serverConfig.appUrl,
  now = nowInSeconds(),
): string {
  const url = new URL(appUrl);
  if (url.protocol !== "https:") {
    throw new Error("TikTok photo delivery requires an HTTPS app URL.");
  }

  url.pathname = `/api/media/tiktok/${encodeURIComponent(mediaId)}`;
  url.search = new URLSearchParams({
    token: createTikTokPhotoDeliveryToken(mediaId, now),
  }).toString();
  url.hash = "";
  return url.toString();
}
