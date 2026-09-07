/**
 * Error codes, their retry classification, and the mapping to the copy a
 * non-technical user reads. See Design.md section 5.6.
 */

export const ERROR_CODES = [
  "unsupported_media",
  "media_too_large",
  "video_too_long",
  "caption_too_long",
  "invalid_media_url",
  "url_unreachable",
  "url_blocked",
  "token_expired",
  "permission_denied",
  "account_disconnected",
  "account_needs_reconnect",
  "rate_limited",
  "timeout",
  "network_error",
  "provider_error",
  "publish_failed",
  "cancelled",
  "unknown",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "rate_limited",
  "timeout",
  "network_error",
  "provider_error",
]);

const AUTH_FAILURES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "token_expired",
  "permission_denied",
  "account_disconnected",
  "account_needs_reconnect",
]);

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  linkedin: "LinkedIn",
  x: "X",
} as const;

export type PlatformLabel = keyof typeof PLATFORM_LABELS;

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (ERROR_CODES as readonly string[]).includes(value)
  );
}

export function toErrorCode(value: unknown): ErrorCode {
  return isErrorCode(value) ? value : "unknown";
}

export function isRetryableError(code: ErrorCode | string | null | undefined) {
  return RETRYABLE.has(toErrorCode(code));
}

export function isAuthFailure(code: ErrorCode | string | null | undefined) {
  return AUTH_FAILURES.has(toErrorCode(code));
}

/** Used when a code arrives without a recognisable platform. */
const FALLBACK_PLATFORM_NAME = "This platform";

function platformName(platform: string): string {
  return PLATFORM_LABELS[platform as PlatformLabel] ?? FALLBACK_PLATFORM_NAME;
}

/**
 * Turns a stored error code into one human sentence that names the platform.
 * Never returns an HTTP status, a raw provider message or a stack trace.
 */
export function humanErrorMessage(
  platform: string,
  code: string | null | undefined,
): string {
  const name = platformName(platform);

  switch (toErrorCode(code)) {
    case "unsupported_media":
      return `${name} rejected this media format.`;
    case "media_too_large":
      return `This file is too large for ${name}. Try a smaller file.`;
    case "video_too_long":
      return `This video is longer than ${name} allows.`;
    case "caption_too_long":
      return `This caption is too long for ${name}.`;
    case "invalid_media_url":
      return "Invalid media URL.";
    case "url_unreachable":
      return "We couldn't reach this URL. Check that it's publicly accessible.";
    case "url_blocked":
      return "Invalid media URL.";
    case "token_expired":
      return `${name} needs reconnection. Reconnect the account, then retry.`;
    case "permission_denied":
      return `${name} denied permission. Reconnect your account to continue.`;
    case "account_disconnected":
      // The fallback name already starts with "This", so the sentence is
      // phrased around it to avoid "This This platform account…".
      return name === FALLBACK_PLATFORM_NAME
        ? `${name} is no longer connected.`
        : `This ${name} account is no longer connected.`;
    case "account_needs_reconnect":
      return `${name} needs reconnection. Reconnect the account, then retry.`;
    case "rate_limited":
      return `${name} is temporarily rate limiting requests. Try again in a few minutes.`;
    case "timeout":
    case "network_error":
      return `We couldn't reach ${name}. Retry to publish this post.`;
    case "provider_error":
      return `Something went wrong while publishing to ${name}. Retry to try again.`;
    case "publish_failed":
      return `Something went wrong while publishing to ${name}. Retry to try again.`;
    case "cancelled":
      return "This post was cancelled and will not be published.";
    case "unknown":
    default:
      return `Something went wrong while publishing to ${name}. Retry to try again.`;
  }
}

export type ProviderErrorOptions = {
  code: ErrorCode;
  message?: string;
  retryable?: boolean;
  status?: number;
  responseLog?: unknown;
  cause?: unknown;
};

export class ProviderError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly responseLog: unknown;

  constructor(options: ProviderErrorOptions) {
    super(options.message ?? humanErrorMessage("unknown", options.code));
    this.name = "ProviderError";
    this.code = options.code;
    this.retryable =
      options.retryable ?? isRetryableError(options.code) ?? false;
    this.status = options.status;
    this.responseLog = options.responseLog;
    if (options.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export type AppErrorCode =
  | ErrorCode
  | "validation_failed"
  | "not_found"
  | "forbidden"
  | "unauthenticated"
  | "rate_limited_action"
  | "not_configured"
  | "server_error";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function errorMessageForUser(error: unknown, fallback: string): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof ProviderError) return error.message;
  return fallback;
}
