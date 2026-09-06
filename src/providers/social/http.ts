import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { serverConfig } from "@/lib/env";
import { humanErrorMessage, ProviderError, type ErrorCode } from "@/lib/errors";
import { sanitize } from "@/lib/logger";
import type { Platform } from "@/lib/status";
import { PLATFORM_LIMITS } from "@/lib/validation/limits";
import type { MediaAsset, ValidationResult } from "./types";
import { validationError } from "./types";

export const DEFAULT_TIMEOUT_MS = 20_000;
/** Media uploads need far longer than an API call. */
export const UPLOAD_TIMEOUT_MS = 120_000;

export type ProviderResponseLog = {
  provider: Platform;
  endpoint: string;
  status: number;
  body: unknown;
};

export type JsonRequestOptions = {
  platform: Platform;
  /** Short label such as `POST /{ig-user-id}/media`. Never a full URL. */
  endpoint: string;
  timeoutMs?: number;
  /** Lets a provider override the mapping for one specific call. */
  mapError?: (
    status: number,
    payload: unknown,
  ) => ProviderError | null | undefined;
};

export type JsonResult<T> = { data: T; responseLog: ProviderResponseLog };

const MAX_LOG_STRING = 500;
const MAX_LOG_ITEMS = 20;
const MAX_LOG_DEPTH = 4;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimForLog(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING
      ? `${value.slice(0, MAX_LOG_STRING)}…`
      : value;
  }

  if (value instanceof Date) return value.toISOString();

  if (value === null || typeof value !== "object") return value;

  if (depth >= MAX_LOG_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOG_ITEMS)
      .map((item) => trimForLog(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(
    value as Record<string, unknown>,
  ).slice(0, MAX_LOG_ITEMS)) {
    result[key] = trimForLog(item, depth + 1);
  }
  return result;
}

/**
 * Builds the small, credential-free record we persist to
 * `post_executions.response_log`. `sanitize` drops anything that looks like a
 * token in addition to the size trimming done here.
 */
export function responseLog(
  platform: Platform,
  endpoint: string,
  status: number,
  body: unknown,
): ProviderResponseLog {
  return sanitize({
    provider: platform,
    endpoint,
    status,
    body: trimForLog(body),
  }) as ProviderResponseLog;
}

export function formBody(
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function jsonBody(values: Record<string, unknown>): string {
  return JSON.stringify(values);
}

function providerMessage(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return "";

  const error = asRecord(root.error);
  const candidates = [
    error?.message,
    error?.error_user_msg,
    error?.error_user_title,
    root.message,
    root.error_description,
    root.error_message,
    error?.type,
    error?.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return "";
}

function providerCode(payload: unknown): string {
  const root = asRecord(payload);
  const error = asRecord(root?.error);
  const candidates = [
    error?.code,
    error?.error_subcode,
    error?.type,
    root?.code,
    root?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

const EXPIRED_TOKENS = new Set([
  "190", // Meta: invalid OAuth 2.0 access token
  "102",
  "463",
  "467",
  "466",
]);

const PERMISSION_CODES = new Set([
  "200",
  "10",
  "299",
  "294",
  "3",
  "368",
  "282",
]);

const RATE_LIMIT_CODES = new Set(["4", "17", "32", "613", "80001", "80004"]);

function authErrorCode(code: string, message: string): ErrorCode {
  const haystack = `${code} ${message}`.toLowerCase();

  if (EXPIRED_TOKENS.has(code)) return "token_expired";
  if (PERMISSION_CODES.has(code)) return "permission_denied";
  if (RATE_LIMIT_CODES.has(code)) return "rate_limited";

  if (
    includesAny(haystack, [
      "expire",
      "session",
      "revoked",
      "invalid oauth",
      "access_token_invalid",
      "token_invalid",
      "unauthor",
    ])
  ) {
    return "token_expired";
  }

  if (
    includesAny(haystack, [
      "permission",
      "not authorized",
      "scope",
      "forbidden",
      "denied",
    ])
  ) {
    return "permission_denied";
  }

  return "token_expired";
}

/**
 * Meta and TikTok report most client mistakes as 400 with a free-text message.
 * These are never retryable: retrying an unsupported file only burns quota.
 */
function clientErrorCode(code: string, message: string): ErrorCode {
  const haystack = `${code} ${message}`.toLowerCase();

  if (RATE_LIMIT_CODES.has(code)) return "rate_limited";
  if (EXPIRED_TOKENS.has(code)) return "token_expired";
  if (PERMISSION_CODES.has(code)) return "permission_denied";

  if (
    includesAny(haystack, [
      "unsupported",
      "not supported",
      "invalid format",
      "invalid media",
      "invalid image",
      "invalid video",
      "invalid file",
      "mime",
      "media type",
      "file type",
      "resolution",
      "aspect ratio",
      "dimensions",
    ])
  ) {
    return "unsupported_media";
  }

  if (
    includesAny(haystack, [
      "too large",
      "too big",
      "file size",
      "exceeds the maximum size",
      "maximum size",
      "larger than",
      "max size",
    ])
  ) {
    return "media_too_large";
  }

  if (
    includesAny(haystack, [
      "duration",
      "too long",
      "longer than",
      "exceeds the maximum length",
    ])
  ) {
    return "video_too_long";
  }

  if (
    includesAny(haystack, ["caption", "description", "title", "text"]) &&
    includesAny(haystack, [
      "too long",
      "longer than",
      "exceed",
      "maximum",
      "limit",
      "characters",
    ])
  ) {
    return "caption_too_long";
  }

  if (
    includesAny(haystack, [
      "url",
      "unreachable",
      "download",
      "could not fetch",
      "couldn't fetch",
      "not accessible",
      "blocked",
    ])
  ) {
    return "url_unreachable";
  }

  return "provider_error";
}

/**
 * Single place where an HTTP status becomes one of our error codes. TikTok also
 * answers with HTTP 200 + `{ error }`, so providers call this directly for that
 * case with the status they did get.
 */
export function mapProviderError(
  platform: Platform,
  status: number,
  payload: unknown,
): ProviderError {
  const message = providerMessage(payload);
  const code = providerCode(payload);
  const log = responseLog(platform, "http-error", status, payload);

  if (status === 401 || status === 403) {
    const mapped = authErrorCode(code, message);
    return new ProviderError({
      code: mapped,
      message: humanErrorMessage(platform, mapped),
      retryable: false,
      status,
      responseLog: log,
    });
  }

  if (status === 429) {
    return new ProviderError({
      code: "rate_limited",
      message: humanErrorMessage(platform, "rate_limited"),
      retryable: true,
      status,
      responseLog: log,
    });
  }

  if (status === 408 || status === 504) {
    return new ProviderError({
      code: "timeout",
      message: humanErrorMessage(platform, "timeout"),
      retryable: true,
      status,
      responseLog: log,
    });
  }

  if (status >= 500) {
    return new ProviderError({
      code: "provider_error",
      message: humanErrorMessage(platform, "provider_error"),
      retryable: true,
      status,
      responseLog: log,
    });
  }

  const mapped =
    status === 400 || status === 422
      ? clientErrorCode(code, message)
      : "provider_error";

  return new ProviderError({
    code: mapped,
    message: humanErrorMessage(platform, mapped),
    retryable: false,
    status,
    responseLog: log,
  });
}

function transportError(
  cause: unknown,
  options: { platform: Platform; endpoint: string },
): ProviderError {
  const name = cause instanceof Error ? cause.name : "";
  const causeCode =
    cause instanceof Error && "code" in cause
      ? (cause as { code?: unknown }).code
      : undefined;

  const isTimeout =
    name === "TimeoutError" ||
    name === "AbortError" ||
    causeCode === "ABORT_ERR" ||
    causeCode === 23;

  const code: ErrorCode = isTimeout ? "timeout" : "network_error";

  return new ProviderError({
    code,
    message: humanErrorMessage(options.platform, code),
    retryable: true,
    cause,
    responseLog: responseLog(options.platform, options.endpoint, 0, null),
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  options: { platform: Platform; endpoint: string; timeoutMs: number },
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (cause) {
    throw transportError(cause, options);
  }
}

function parseBody(text: string): unknown {
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  options: JsonRequestOptions,
): Promise<JsonResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const response = await fetchWithTimeout(url, init, {
    platform: options.platform,
    endpoint: options.endpoint,
    timeoutMs,
  });

  const text = await response.text();
  const payload = parseBody(text);

  if (!response.ok) {
    const mapped = options.mapError?.(response.status, payload);
    throw mapped ?? mapProviderError(options.platform, response.status, payload);
  }

  const log = responseLog(
    options.platform,
    options.endpoint,
    response.status,
    payload ?? text.slice(0, MAX_LOG_STRING),
  );

  if (payload === undefined && text.trim().length > 0) {
    throw new ProviderError({
      code: "provider_error",
      message: humanErrorMessage(options.platform, "provider_error"),
      status: response.status,
      responseLog: log,
    });
  }

  return { data: payload as T, responseLog: log };
}

/**
 * Puts raw bytes to a provider supplied upload URL (TikTok direct post).
 * The URL is short lived and provider issued; it is never logged.
 */
export async function uploadBytes(
  url: string,
  bytes: Uint8Array,
  options: {
    platform: Platform;
    endpoint: string;
    contentType: string;
    contentRange: string;
    timeoutMs?: number;
  },
): Promise<void> {
  // `BodyInit` only accepts a view backed by a plain `ArrayBuffer`, so copy when
  // the caller handed us a subarray or a shared buffer.
  const payload: ArrayBuffer =
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : (new Uint8Array(bytes).buffer as ArrayBuffer);

  const response = await fetchWithTimeout(
    url,
    {
      method: "PUT",
      headers: {
        "Content-Type": options.contentType,
        "Content-Range": options.contentRange,
      },
      body: payload,
    },
    {
      platform: options.platform,
      endpoint: options.endpoint,
      timeoutMs: options.timeoutMs ?? UPLOAD_TIMEOUT_MS,
    },
  );

  if (response.ok) return;

  const text = await response.text();
  throw mapProviderError(
    options.platform,
    response.status,
    parseBody(text) ?? text.slice(0, MAX_LOG_STRING),
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type SignedOAuthState = {
  userId: string;
  platform: Platform;
  nonce: string;
  /** The opaque state the caller asked for, carried through untouched. */
  sid?: string;
};

/**
 * `state` travels through the user's browser, so it is signed instead of being
 * a bare `userId`. HMAC key is the same encryption key we already require.
 */
export function signOAuthState(input: {
  userId: string;
  platform: Platform;
  state?: string;
}): string {
  const payload: SignedOAuthState = {
    userId: input.userId,
    platform: input.platform,
    nonce: randomBytes(16).toString("base64url"),
    ...(input.state ? { sid: input.state } : {}),
  };

  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", serverConfig.encryptionKey)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

export function verifyOAuthState(state: string): SignedOAuthState | null {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", serverConfig.encryptionKey)
    .update(body)
    .digest();
  const provided = Buffer.from(signature, "base64url");

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    const record = asRecord(parsed);
    if (!record) return null;

    const { userId, platform, nonce, sid } = record;
    if (typeof userId !== "string" || typeof nonce !== "string") return null;
    if (platform !== "instagram" && platform !== "facebook" && platform !== "tiktok") {
      return null;
    }

    return {
      userId,
      platform,
      nonce,
      ...(typeof sid === "string" ? { sid } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Shared half of `validateContent`: the rules that are pure numbers and MIME
 * types, straight from `PLATFORM_LIMITS`.
 */
export function validateMediaLimits(
  platform: Platform,
  media: MediaAsset,
  caption: string,
): ValidationResult {
  const limits = PLATFORM_LIMITS[platform];

  if (caption.length > limits.captionLength) {
    return validationError(
      "caption_too_long",
      humanErrorMessage(platform, "caption_too_long"),
    );
  }

  const allowed =
    media.mediaType === "video" ? limits.videoMimeTypes : limits.imageMimeTypes;

  if (!allowed.includes(media.mimeType)) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(platform, "unsupported_media"),
    );
  }

  if (media.fileSize !== null && media.fileSize > limits.maxBytes) {
    return validationError(
      "media_too_large",
      humanErrorMessage(platform, "media_too_large"),
    );
  }

  if (media.mediaType === "video") {
    const { minDurationSec, maxDurationSec } = limits;

    if (
      typeof maxDurationSec === "number" &&
      media.duration !== null &&
      media.duration > maxDurationSec
    ) {
      return validationError(
        "video_too_long",
        humanErrorMessage(platform, "video_too_long"),
      );
    }

    // There is no `video_too_short` code; a clip under the minimum is simply
    // rejected by the platform, which is the closest honest message.
    if (
      typeof minDurationSec === "number" &&
      media.duration !== null &&
      media.duration < minDurationSec
    ) {
      return validationError(
        "unsupported_media",
        humanErrorMessage(platform, "unsupported_media"),
      );
    }
  }

  const { minWidth, minHeight, maxWidth, maxHeight } = limits;
  const { width, height } = media;

  if (width !== null && minWidth !== undefined && width < minWidth) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(platform, "unsupported_media"),
    );
  }
  if (height !== null && minHeight !== undefined && height < minHeight) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(platform, "unsupported_media"),
    );
  }
  if (width !== null && maxWidth !== undefined && width > maxWidth) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(platform, "unsupported_media"),
    );
  }
  if (height !== null && maxHeight !== undefined && height > maxHeight) {
    return validationError(
      "unsupported_media",
      humanErrorMessage(platform, "unsupported_media"),
    );
  }

  return { ok: true };
}
