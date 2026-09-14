import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import { AppError } from "@/lib/errors";
import { isBlockedAddress, isBlockedHostname } from "@/lib/media/fetch-url";

const MAX_URL_LENGTH = 2048;

export function validateWebhookUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.trim().length === 0 || raw.trim().length > MAX_URL_LENGTH) {
    throw new AppError("validation_failed", "Enter a valid webhook URL.");
  }
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new AppError("validation_failed", "Enter a valid webhook URL."); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    throw new AppError("validation_failed", "Webhook URLs must use HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new AppError("validation_failed", "Webhook URLs must use HTTPS in production.");
  }
  if (isBlockedHostname(url.hostname)) throw new AppError("validation_failed", "That webhook address is not allowed.");
  if (isIP(url.hostname) !== 0 && isBlockedAddress(url.hostname)) throw new AppError("validation_failed", "That webhook address is not allowed.");
  return url;
}

export async function assertWebhookUrlIsPublic(url: URL): Promise<void> {
  if (isBlockedHostname(url.hostname)) throw new AppError("url_blocked", "That webhook address is not allowed.");
  if (isIP(url.hostname) !== 0) {
    if (isBlockedAddress(url.hostname)) throw new AppError("url_blocked", "That webhook address is not allowed.");
    return;
  }
  let addresses: Array<{ address: string }>;
  try { addresses = await lookup(url.hostname, { all: true }); } catch { throw new AppError("url_unreachable", "We couldn't reach this webhook address."); }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new AppError("url_blocked", "That webhook address is not allowed.");
  }
}
