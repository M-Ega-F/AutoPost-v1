import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  MAX_REMOTE_DOWNLOAD_BYTES,
  REMOTE_FETCH_TIMEOUT_MS,
} from "@/lib/validation/limits";

import { sniffMimeType, type AcceptedMimeType } from "./probe";

const MESSAGE_INVALID_URL = "Invalid media URL.";
const MESSAGE_HTTPS_ONLY = "Only HTTPS URLs are supported.";
const MESSAGE_UNREACHABLE =
  "We couldn't reach this URL. Check that it's publicly accessible.";
const MESSAGE_UNSUPPORTED =
  "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.";
const MESSAGE_TOO_LARGE = `This file is too large. Maximum size is ${Math.round(
  MAX_REMOTE_DOWNLOAD_BYTES / (1024 * 1024),
)} MB.`;

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_URL_LENGTH = 2048;

export type FetchedMedia = {
  bytes: Uint8Array;
  mimeType: AcceptedMimeType;
  size: number;
};

/** Hosts that are internal by name rather than by address. */
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
] as const;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

function invalidUrl(): AppError {
  return new AppError("invalid_media_url", MESSAGE_INVALID_URL);
}

function blockedUrl(): AppError {
  return new AppError("url_blocked", MESSAGE_INVALID_URL);
}

function unreachableUrl(): AppError {
  return new AppError("url_unreachable", MESSAGE_UNREACHABLE);
}

function parseIpv4(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number.parseInt(part, 10);
    if (value < 0 || value > 255) return null;
    octets.push(value);
  }

  return [octets[0], octets[1], octets[2], octets[3]];
}

/**
 * Expands an IPv6 address to its 16 bytes. Handles `::` compression and a
 * trailing dotted-quad form such as `::ffff:127.0.0.1`.
 */
function parseIpv6(address: string): Uint8Array | null {
  let value = address;

  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);

  // Rewrite a trailing dotted quad (`::ffff:127.0.0.1`) into two hex words.
  const lastColon = value.lastIndexOf(":");
  if (lastColon >= 0 && value.slice(lastColon + 1).includes(".")) {
    const octets = parseIpv4(value.slice(lastColon + 1));
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":").filter((part) => part !== "") : [];
  const tail =
    halves.length === 2 && halves[1]
      ? halves[1].split(":").filter((part) => part !== "")
      : [];

  let words: string[];

  if (halves.length === 1) {
    if (head.length !== 8) return null;
    words = head;
  } else {
    // `::` must stand for at least one omitted group.
    if (head.length + tail.length > 7) return null;
    const missing = 8 - (head.length + tail.length);
    words = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  }

  const parsed: number[] = [];
  for (const part of words) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    parsed.push(Number.parseInt(part, 16));
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    bytes[index * 2] = (parsed[index] >> 8) & 0xff;
    bytes[index * 2 + 1] = parsed[index] & 0xff;
  }

  return bytes;
}

/** `::ffff:1.2.3.4` and `::1.2.3.4` are really IPv4 addresses. */
function unwrapIpv4Mapped(bytes: Uint8Array): Uint8Array | null {
  const leadingZeroes = bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0;
  if (!leadingZeroes) return null;

  const tenZeroes = bytes[4] === 0 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0 && bytes[8] === 0 && bytes[9] === 0;
  if (!tenZeroes) return null;

  const mapped = bytes[10] === 0xff && bytes[11] === 0xff;
  const compatible = bytes[10] === 0 && bytes[11] === 0;
  if (!mapped && !compatible) return null;

  return bytes.subarray(12);
}

function isPrivateIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return true; // unparseable is never public
  const [a, b] = octets;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier grade NAT
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 and 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && octets[2] === 100) return true; // documentation
  if (a === 203 && b === 0 && octets[2] === 113) return true; // documentation
  if (a === 192 && b === 88 && octets[2] === 99) return true; // 6to4 relay anycast
  if (a >= 224) return true; // multicast and reserved, incl. 255.255.255.255

  return false;
}

function isPrivateIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) return true;

  const mapped = unwrapIpv4Mapped(bytes);
  if (mapped) return isPrivateIpv4(Array.from(mapped).join("."));

  const allZero = bytes.every((byte) => byte === 0);
  if (allZero) return true; // ::/128

  if (bytes[0] === 0 && bytes.subarray(1, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return true; // ::1 loopback
  }

  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (bytes[0] === 0xff) return true; // ff00::/8 multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return true; // 2001:db8::/32 documentation
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return true; // 2002::/16 6to4
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b
  ) {
    return true; // 64:ff9b::/96 NAT64
  }
  if (bytes[0] === 0x01 && bytes.subarray(1).every((byte) => byte === 0)) {
    return true; // 100::/64 discard-only
  }

  return false;
}

/**
 * True when the address must never be dialled: loopback, private, link-local,
 * multicast, reserved and cloud metadata ranges.
 * Exported (as a pure predicate) so the SSRF allow-list is unit testable
 * without opening a socket.
 */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true; // unparseable is never public
}

/**
 * True when the hostname itself is internal, before it is ever resolved.
 * Exported (as a pure predicate) so the SSRF allow-list is unit testable
 * without opening a socket.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * The request itself is issued by `fetch`, which resolves DNS again
 * independently. Validating every address here means a hostname that resolves
 * to *any* non-public address is rejected before a socket is ever opened, and
 * the same check runs again on every redirect hop.
 */
async function assertTargetIsPublic(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isBlockedHostname(hostname)) throw blockedUrl();

  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) throw blockedUrl();
    return;
  }

  let records: LookupAddress[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw unreachableUrl();
  }

  if (records.length === 0) throw unreachableUrl();

  for (const record of records) {
    if (isBlockedAddress(record.address)) throw blockedUrl();
  }
}

function parseUrl(rawUrl: string): URL {
  const value = rawUrl.trim();

  if (!value || value.length > MAX_URL_LENGTH) throw invalidUrl();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidUrl();
  }

  // `https://good.example.com@127.0.0.1/` confuses parsers and humans alike.
  if (url.username || url.password) throw invalidUrl();

  if (url.protocol !== "https:") {
    throw new AppError("invalid_media_url", MESSAGE_HTTPS_ONLY);
  }

  return url;
}

/**
 * The `content-type` header is advisory only: a remote server can claim
 * anything, so the leading bytes decide and an unrecognised body is refused
 * even when the header names an accepted type.
 */
function resolveMimeType(bytes: Uint8Array): AcceptedMimeType {
  const sniffed = sniffMimeType(bytes);
  if (sniffed) return sniffed;

  throw new AppError("unsupported_media", MESSAGE_UNSUPPORTED);
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Streams the body and gives up the moment the cap is exceeded. */
async function readCappedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_DOWNLOAD_BYTES) {
    throw new AppError("media_too_large", MESSAGE_TOO_LARGE);
  }

  const body = response.body;
  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_REMOTE_DOWNLOAD_BYTES) {
      throw new AppError("media_too_large", MESSAGE_TOO_LARGE);
    }
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > MAX_REMOTE_DOWNLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("media_too_large", MESSAGE_TOO_LARGE);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return concat(chunks, total);
}

/**
 * Downloads a pasted media URL. Every hop (origin plus up to three redirects)
 * must be HTTPS and must resolve exclusively to public IP addresses, so this
 * can never be aimed at localhost, a private network or a metadata endpoint.
 */
export async function fetchMediaFromUrl(rawUrl: string): Promise<FetchedMedia> {
  let target = parseUrl(rawUrl);

  // One budget for the whole chain: DNS, connect, headers and body.
  const signal = AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertTargetIsPublic(target);

      let response: Response;
      try {
        response = await fetch(target, {
          redirect: "manual",
          signal,
          headers: {
            accept:
              "image/jpeg,image/png,image/webp,video/mp4,video/quicktime;q=0.9,*/*;q=0.8",
            "user-agent": "AutoPost/1.0 (+media-import)",
          },
        });
      } catch (error) {
        logger.warn("media url fetch failed", {
          host: target.host,
          reason: signal.aborted ? "timeout" : error instanceof Error ? error.name : "network",
        });
        throw unreachableUrl();
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);

        if (!location) throw unreachableUrl();

        const next = parseUrl(new URL(location, target).toString());
        if (next.protocol !== "https:") {
          throw new AppError("invalid_media_url", MESSAGE_HTTPS_ONLY);
        }

        target = next;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw unreachableUrl();
      }

      const bytes = await readCappedBody(response);
      const mimeType = resolveMimeType(bytes);

      return { bytes, mimeType, size: bytes.byteLength };
    }

    throw unreachableUrl();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreachableUrl();
  }
}
