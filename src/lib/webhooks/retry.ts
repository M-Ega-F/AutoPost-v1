export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

export function isRetryableWebhookStatus(status: number | null): boolean {
  return status === null || status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function retryDelayMs(attemptCount: number, retryAfter: string | null, now = Date.now()): number {
  const header = retryAfter?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60 * 60_000, Math.max(0, Math.ceil(seconds * 1000)));
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(60 * 60_000, Math.max(0, date - now));
  }
  return WEBHOOK_RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), WEBHOOK_RETRY_DELAYS_MS.length - 1)] ?? WEBHOOK_RETRY_DELAYS_MS.at(-1)!;
}
