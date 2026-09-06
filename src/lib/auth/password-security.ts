import "server-only";

import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";

/**
 * Leaked-password protection using the Have I Been Pwned Pwned Passwords API.
 *
 * The Supabase Free plan has no built-in leaked-password protection, so the
 * check runs here, on the server, before a password is ever handed to Supabase.
 *
 * Privacy model — k-anonymity:
 *   1. The plaintext password exists only in memory, only for the duration of
 *      the call. It is never persisted, never returned, never logged.
 *   2. It is hashed with SHA-1 (the algorithm HIBP indexes by).
 *   3. Only the FIRST FIVE hex characters of the hash are sent to HIBP.
 *   4. The full hash never leaves this process, and is never written anywhere.
 *   5. Matching happens locally against the returned suffixes.
 *
 * No API key is required or accepted: the Pwned Passwords range endpoint is
 * unauthenticated and free.
 */

const HIBP_RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT_MS = 5_000;
const PREFIX_LENGTH = 5;

/**
 * The only sentence the user sees when the password is known to be breached.
 * It deliberately says nothing about how many breaches, or which dataset.
 */
export const PWNED_PASSWORD_MESSAGE = "Please choose a different password.";

/** Shown when the check could not be performed. Never contains API detail. */
export const PASSWORD_CHECK_UNAVAILABLE_MESSAGE =
  "We couldn't check this password right now. Try again in a moment.";

export type BreachCheckResult = "safe" | "pwned" | "unavailable";

export type Sha1Split = {
  /** The part sent to HIBP. */
  prefix: string;
  /** The part kept local and matched against the response. */
  suffix: string;
};

export function splitSha1(password: string): Sha1Split {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return {
    prefix: hash.slice(0, PREFIX_LENGTH),
    suffix: hash.slice(PREFIX_LENGTH),
  };
}

/**
 * Parses the HIBP range body: one `SUFFIX:COUNT` pair per line, CRLF separated.
 * Counts are returned for completeness but are never shown to the user.
 */
export function parsePwnedRanges(
  body: string,
): Array<{ suffix: string; count: number }> {
  const results: Array<{ suffix: string; count: number }> = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;

    const suffix = trimmed.slice(0, separator).trim().toUpperCase();
    const count = Number.parseInt(trimmed.slice(separator + 1).trim(), 10);

    if (!/^[0-9A-F]+$/.test(suffix) || Number.isNaN(count)) continue;

    results.push({ suffix, count });
  }

  return results;
}

/** Case-insensitive suffix match, as HIBP returns uppercase hex. */
export function isSuffixPwned(body: string, suffix: string): boolean {
  const wanted = suffix.toUpperCase();
  return parsePwnedRanges(body).some((entry) => entry.suffix === wanted);
}

/**
 * Verifies a password against the Pwned Passwords corpus.
 *
 * Returns `"unavailable"` instead of throwing when HIBP cannot be reached —
 * callers decide what that means. Failing closed (refusing to continue) is the
 * safe default, because an unverified password must not be treated as safe.
 */
export async function checkPasswordBreach(
  password: string,
): Promise<BreachCheckResult> {
  let split: Sha1Split;

  try {
    split = splitSha1(password);
  } catch {
    return "unavailable";
  }

  // Only the prefix leaves the process.
  const { prefix, suffix } = split;

  try {
    const response = await fetch(`${HIBP_RANGE_ENDPOINT}${prefix}`, {
      method: "GET",
      headers: {
        Accept: "text/plain",
        "User-Agent": "autopost-password-check",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });

    if (!response.ok) {
      logger.warn("password breach check failed", { status: response.status });
      return "unavailable";
    }

    return isSuffixPwned(await response.text(), suffix) ? "pwned" : "safe";
  } catch (error) {
    // Times out, DNS failure, TLS error, or an aborted connection.
    logger.warn("password breach check unavailable", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return "unavailable";
  }
  // `suffix` and the plaintext password go out of scope here; nothing retains
  // them and nothing below this point can log them.
}

/**
 * The simple boolean API.
 *
 * Returns `true` unless the password was positively verified as safe, so a
 * caller that only uses this function fails closed on an API outage.
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  return (await checkPasswordBreach(password)) !== "safe";
}
