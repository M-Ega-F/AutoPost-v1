import { NextResponse } from "next/server";

import { AppError } from "@/lib/errors";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "GONE"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

type ApiErrorOptions = {
  status: number;
  code: ApiErrorCode;
  message: string;
  headers?: HeadersInit;
};

const NO_STORE = { "Cache-Control": "no-store" };

export function apiError(options: ApiErrorOptions): Response {
  return NextResponse.json(
    { error: { code: options.code, message: options.message } },
    {
      status: options.status,
      headers: { ...NO_STORE, ...options.headers },
    },
  );
}

export function apiSuccess<T>(data: T, status = 200): Response {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function apiNoContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

export function apiErrorFromUnknown(
  error: unknown,
  fallback = "Something went wrong. Try again.",
): Response {
  if (error instanceof AppError) {
    switch (error.code) {
      case "unauthenticated":
        return apiError({ status: 401, code: "UNAUTHORIZED", message: error.message });
      case "forbidden":
        return apiError({ status: 403, code: "FORBIDDEN", message: error.message });
      case "conflict":
        return apiError({ status: 409, code: "CONFLICT", message: error.message });
      case "not_found":
        return apiError({ status: 404, code: "NOT_FOUND", message: error.message });
      case "gone":
        return apiError({ status: 410, code: "GONE", message: error.message });
      case "rate_limited_action":
        return apiError({ status: 429, code: "RATE_LIMITED", message: error.message });
      case "validation_failed":
        return apiError({ status: 422, code: "VALIDATION_ERROR", message: error.message });
      default:
        return apiError({ status: 500, code: "INTERNAL_ERROR", message: fallback });
    }
  }

  return apiError({ status: 500, code: "INTERNAL_ERROR", message: fallback });
}

export function apiValidationError(message: string): Response {
  return apiError({ status: 422, code: "VALIDATION_ERROR", message });
}

export function apiMethodNotAllowed(allow: string): Response {
  return apiError({
    status: 405,
    code: "METHOD_NOT_ALLOWED",
    message: "This operation is not supported.",
    headers: { Allow: allow },
  });
}
