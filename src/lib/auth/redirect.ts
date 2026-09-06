/**
 * Validation for post-login redirect targets.
 *
 * Only internal, root-relative paths are accepted. Anything that could leave
 * the site — an absolute URL, a protocol-relative `//host`, a scheme such as
 * `javascript:` or `data:`, or an encoded version of those — falls back to a
 * safe default. This is the single place the rule lives, so a page, a server
 * action and the proxy all behave identically.
 */

export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";
export const LOGIN_ROUTE = "/login";

const MAX_NEXT_LENGTH = 512;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
// Control characters would let a redirect target break out of the header.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function isSafePath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return false;

  // Must be root-relative.
  if (!value.startsWith("/")) return false;

  // `//host` and `/\host` are treated as absolute URLs by browsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return false;

  // Any scheme (`https:`, `javascript:`, `data:`) is rejected.
  if (SCHEME_PATTERN.test(value)) return false;

  if (CONTROL_CHARACTERS.test(value)) return false;

  return true;
}

/**
 * Returns `value` when it is a safe internal path, otherwise `fallback`.
 * The raw value is returned (not the decoded one) so query strings survive.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_AUTHENTICATED_ROUTE,
): string {
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (!isSafePath(raw)) return fallback;

  // Decode once so `%2F%2Fevil.com` cannot smuggle an absolute URL through.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  if (!isSafePath(decoded)) return fallback;

  // Sending the user straight back to the login form would loop.
  const pathname = raw.split("?")[0].split("#")[0];
  if (pathname === LOGIN_ROUTE) return fallback;

  return raw;
}

/** Builds `/login?next=/create-post`, omitting `next` when it is the default. */
export function loginUrlWithNext(next: string | null | undefined): string {
  const target = safeNextPath(next);
  if (target === DEFAULT_AUTHENTICATED_ROUTE) return LOGIN_ROUTE;
  return `${LOGIN_ROUTE}?next=${encodeURIComponent(target)}`;
}
