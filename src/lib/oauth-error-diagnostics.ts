import { ProviderError } from "@/lib/errors";
import { sanitize } from "@/lib/logger";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function constructorNameOf(value: unknown): string | null {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return null;
  }

  const constructor = (value as { constructor?: unknown }).constructor;
  if (typeof constructor !== "function") return null;

  return typeof constructor.name === "string" ? constructor.name : null;
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = sanitize(value);
  return typeof sanitized === "string" ? sanitized : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function oauthErrorDiagnostics(
  platform: string,
  error: unknown,
): Record<string, unknown> {
  const errorRecord = asRecord(error);
  const isProviderError = error instanceof ProviderError;
  const response = asRecord(errorRecord?.responseLog);
  const body = asRecord(response?.body);
  const providerError = asRecord(body?.error);
  const providerErrors = Array.isArray(providerError?.errors)
    ? providerError.errors
    : Array.isArray(body?.errors)
      ? body.errors
      : [];
  const firstProviderError = asRecord(providerErrors[0]);
  const responseStatus = safeNumber(response?.status);
  const errorStatus = safeNumber(errorRecord?.status);
  const errorMessage =
    safeString(errorRecord?.message) ??
    (error instanceof Error ? sanitize(error.message) : String(error));

  return {
    platform,
    error: errorMessage,
    constructorName: constructorNameOf(error),
    isProviderError,
    errorCode: safeString(errorRecord?.code),
    httpStatus: errorStatus ?? responseStatus,
    endpoint: safeString(response?.endpoint),
    providerMessage:
      safeString(providerError?.message) ?? safeString(body?.message),
    googleError: safeString(body?.error),
    googleErrorDescription: safeString(body?.error_description),
    googleReason: safeString(firstProviderError?.reason),
  };
}
