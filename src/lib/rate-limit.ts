import "server-only";

import { AppError } from "@/lib/errors";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitRule = {
  /** Maximum number of allowed actions in the window. */
  limit: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 5 * 60_000 },
  signup: { limit: 10, windowMs: 5 * 60_000 },
  createPost: { limit: 20, windowMs: 60_000 },
  saveDraft: { limit: 60, windowMs: 60_000 },
  publishNow: { limit: 20, windowMs: 60_000 },
  schedule: { limit: 20, windowMs: 60_000 },
  retry: { limit: 30, windowMs: 60_000 },
  cancel: { limit: 30, windowMs: 60_000 },
  oauthCallback: { limit: 20, windowMs: 5 * 60_000 },
  mediaUpload: { limit: 30, windowMs: 60_000 },
  mediaUrl: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * Process-local fixed-window limiter. It is deliberately dependency free: it
 * needs no Redis round trip, and its only job is to blunt accidental double
 * submits and scripted abuse. A multi-instance deployment should move this to
 * Redis — the call sites would not change.
 */
export function consumeRateLimit(
  key: RateLimitKey,
  identifier: string,
): { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number } {
  const rule = RATE_LIMITS[key];
  const bucketKey = `${key}:${identifier}`;
  const now = Date.now();

  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, remaining: rule.limit - 1 };
  }

  if (existing.count >= rule.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: rule.limit - existing.count };
}

export function assertRateLimit(
  key: RateLimitKey,
  identifier: string,
  message = "Too many attempts. Try again in a few minutes.",
): void {
  const result = consumeRateLimit(key, identifier);
  if (!result.ok) {
    throw new AppError("rate_limited_action", message);
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
