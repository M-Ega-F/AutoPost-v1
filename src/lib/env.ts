import "server-only";

/**
 * Access to server-side configuration.
 *
 * Every value is resolved lazily so that importing this module never throws at
 * build time. Values are only required at the moment they are first used, which
 * keeps `next build` working in environments that are not fully configured.
 */

export class MissingConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Missing environment configuration: ${missing.join(", ")}. Copy the values from your Supabase, Upstash and social app dashboards into .env.local.`,
    );
    this.name = "MissingConfigError";
    this.missing = missing;
  }
}

function read(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function required(...names: string[]): string {
  for (const name of names) {
    const value = read(name);
    if (value) return value;
  }
  throw new MissingConfigError(names);
}

function optional(...names: string[]): string | undefined {
  for (const name of names) {
    const value = read(name);
    if (value) return value;
  }
  return undefined;
}

function lazy<T>(factory: () => T): () => T {
  let cached: { value: T } | undefined;
  return () => {
    if (!cached) cached = { value: factory() };
    return cached.value;
  };
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function validHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }

    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export const serverConfig = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },

  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  },

  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
  },

  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
  },

  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },

  get redisUrl() {
    return required("UPSTASH_REDIS_URL", "REDIS_URL");
  },

  get appUrlOptional(): string | undefined {
    return firstDefined(
      validHttpUrl(read("APP_URL")),
      validHttpUrl(read("NEXT_PUBLIC_APP_URL")),
      validHttpUrl(
        read("VERCEL_URL") ? `https://${read("VERCEL_URL")}` : undefined,
      ),
    );
  },

  get appUrl() {
    return this.appUrlOptional ?? required("APP_URL");
  },

  get mediaBucket() {
    return optional("SUPABASE_MEDIA_BUCKET", "MEDIA_BUCKET") ?? "post-media";
  },

  get meta() {
    return lazy(() => ({
      // One Meta app owns both Instagram and Facebook integrations. Keep the
      // names canonical so a stale provider-specific variable cannot make the
      // two OAuth flows disagree about whether Meta is configured.
      clientId: optional("META_CLIENT_ID"),
      clientSecret: optional("META_CLIENT_SECRET"),
      graphVersion: optional("META_GRAPH_API_VERSION") ?? "v23.0",
    }))();
  },

  get tiktok() {
    return lazy(() => ({
      clientKey: optional("TIKTOK_CLIENT_KEY"),
      clientSecret: optional("TIKTOK_CLIENT_SECRET"),
    }))();
  },
} as const;

/**
 * Public base URL for links and OAuth redirect URIs.
 *
 * `APP_URL` is the source of truth because a redirect URI has to match what is
 * registered in the Meta/TikTok dashboard. When it is not set yet we fall back
 * to the incoming request's origin so a local run does not 500 — an
 * unconfigured app is a broken OAuth flow, not a crashed route.
 */
export function resolveAppUrl(fallbackOrigin?: string): string {
  const configured = serverConfig.appUrlOptional;
  if (configured) return configured;
  if (fallbackOrigin) return fallbackOrigin;
  return serverConfig.appUrl;
}

export function isMissingConfigError(error: unknown): error is MissingConfigError {
  return error instanceof MissingConfigError;
}

export function describeMissingConfig(error: unknown): string[] | undefined {
  return isMissingConfigError(error) ? error.missing : undefined;
}
