import { createHash } from "node:crypto";
import { isIP } from "node:net";

import IORedis from "ioredis";

export const LOGIN_COOLDOWN_MESSAGE = "Too many login attempts.";

const FAILURE_COUNTER_TTL_SECONDS = 24 * 60 * 60;

const RECORD_FAILURE_SCRIPT = `
local cooldownTtlMs = redis.call("PTTL", KEYS[2])
if cooldownTtlMs > 0 then
  local current = redis.call("GET", KEYS[1]) or "0"
  return {-1, cooldownTtlMs, current}
end

local failures = redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[1], ARGV[1])

local cooldownSeconds = 0
if failures >= 30 then
  cooldownSeconds = 1800
elseif failures >= 25 then
  cooldownSeconds = 1200
elseif failures >= 20 then
  cooldownSeconds = 900
elseif failures >= 15 then
  cooldownSeconds = 600
elseif failures >= 10 then
  cooldownSeconds = 300
elseif failures >= 5 then
  cooldownSeconds = 60
end

if cooldownSeconds > 0 then
  redis.call("SET", KEYS[2], "1", "EX", cooldownSeconds)
end

return {failures, cooldownSeconds, 0}
`;

export type LoginCooldown = {
  blocked: boolean;
  retryAfterSeconds: number;
};

export type LoginFailureResult = {
  failedAttempts: number;
  cooldownSeconds: number;
};

export type LoginRateLimitStore = {
  getCooldownSeconds: (key: string) => Promise<number>;
  recordFailure: (key: string) => Promise<LoginFailureResult>;
  reset: (key: string) => Promise<void>;
};

export function getLoginCooldownSeconds(failedAttempts: number): number {
  if (failedAttempts >= 30) return 1_800;
  if (failedAttempts >= 25) return 1_200;
  if (failedAttempts >= 20) return 900;
  if (failedAttempts >= 15) return 600;
  if (failedAttempts >= 10) return 300;
  if (failedAttempts >= 5) return 60;
  return 0;
}

export function getTrustedClientIp(headerList: { get: (name: string) => string | null }): string {
  // Vercel overwrites these platform headers with the public client IP. A
  // reverse proxy in front of Vercel must be configured as a trusted proxy;
  // arbitrary client-supplied forwarding headers are not trusted here.
  const candidates = [
    headerList.get("x-vercel-forwarded-for"),
    headerList.get("x-real-ip"),
    headerList.get("x-forwarded-for"),
  ];

  for (const value of candidates) {
    const candidate = value?.split(",")[0]?.trim();
    if (candidate && isIP(candidate) !== 0) return candidate;
  }

  return "unknown";
}

function loginRateLimitKey(identity: string): string {
  const digest = createHash("sha256").update(identity).digest("hex");
  return `autopost:auth:login-failure:v1:${digest}`;
}

type MemoryEntry = {
  failedAttempts: number;
  expiresAt: number;
  cooldownUntil: number;
};

export function createMemoryLoginRateLimitStore(now = () => Date.now()): LoginRateLimitStore {
  const entries = new Map<string, MemoryEntry>();

  function getEntry(key: string, currentTime: number): MemoryEntry | undefined {
    const entry = entries.get(key);
    if (!entry || entry.expiresAt <= currentTime) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    async getCooldownSeconds(key) {
      const currentTime = now();
      const entry = getEntry(key, currentTime);
      if (!entry || entry.cooldownUntil <= currentTime) return 0;
      return Math.max(1, Math.ceil((entry.cooldownUntil - currentTime) / 1000));
    },

    async recordFailure(key) {
      const currentTime = now();
      const entry = getEntry(key, currentTime);
      if (entry && entry.cooldownUntil > currentTime) {
        return {
          failedAttempts: entry.failedAttempts,
          cooldownSeconds: Math.max(1, Math.ceil((entry.cooldownUntil - currentTime) / 1000)),
        };
      }

      const next: MemoryEntry = entry ?? {
        failedAttempts: 0,
        expiresAt: currentTime + FAILURE_COUNTER_TTL_SECONDS * 1000,
        cooldownUntil: 0,
      };
      next.failedAttempts += 1;
      next.expiresAt = currentTime + FAILURE_COUNTER_TTL_SECONDS * 1000;
      next.cooldownUntil = currentTime + getLoginCooldownSeconds(next.failedAttempts) * 1000;
      entries.set(key, next);

      return {
        failedAttempts: next.failedAttempts,
        cooldownSeconds: getLoginCooldownSeconds(next.failedAttempts),
      };
    },

    async reset(key) {
      entries.delete(key);
    },
  };
}

function createRedisLoginRateLimitStore(redis: IORedis, fallback: LoginRateLimitStore): LoginRateLimitStore {
  function redisKeys(key: string): [string, string] {
    return [`${key}:failures`, `${key}:cooldown`];
  }

  return {
    async getCooldownSeconds(key) {
      try {
        const [, cooldownKey] = redisKeys(key);
        const ttlMs = Number(await redis.pttl(cooldownKey));
        return ttlMs > 0 ? Math.max(1, Math.ceil(ttlMs / 1000)) : 0;
      } catch {
        return fallback.getCooldownSeconds(key);
      }
    },

    async recordFailure(key) {
      try {
        const [failureKey, cooldownKey] = redisKeys(key);
        const result = (await redis.eval(
          RECORD_FAILURE_SCRIPT,
          2,
          failureKey,
          cooldownKey,
          FAILURE_COUNTER_TTL_SECONDS,
        )) as Array<number | string>;
        const first = Number(result[0]);
        const second = Number(result[1]);
        const third = Number(result[2]);

        if (first === -1) {
          return {
            failedAttempts: third,
            cooldownSeconds: Math.max(1, Math.ceil(second / 1000)),
          };
        }

        return { failedAttempts: first, cooldownSeconds: second };
      } catch {
        return fallback.recordFailure(key);
      }
    },

    async reset(key) {
      try {
        await redis.del(...redisKeys(key));
      } catch {
        await fallback.reset(key);
      }
    },
  };
}

let defaultStore: LoginRateLimitStore | undefined;

function createDefaultStore(): LoginRateLimitStore {
  const fallback = createMemoryLoginRateLimitStore();
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return fallback;

  try {
    const redis = new IORedis(redisUrl, {
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on("error", () => undefined);
    return createRedisLoginRateLimitStore(redis, fallback);
  } catch {
    return fallback;
  }
}

export function getLoginRateLimitStore(): LoginRateLimitStore {
  if (!defaultStore) defaultStore = createDefaultStore();
  return defaultStore;
}

export function isInvalidCredentialsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return candidate.code === "invalid_credentials" || candidate.name === "AuthInvalidCredentialsError";
}

export async function getLoginCooldown(
  identity: string,
  store = getLoginRateLimitStore(),
): Promise<LoginCooldown> {
  const retryAfterSeconds = await store.getCooldownSeconds(loginRateLimitKey(identity));
  return { blocked: retryAfterSeconds > 0, retryAfterSeconds };
}

export async function recordLoginFailure(
  identity: string,
  store = getLoginRateLimitStore(),
): Promise<LoginFailureResult> {
  return store.recordFailure(loginRateLimitKey(identity));
}

export async function resetLoginFailures(
  identity: string,
  store = getLoginRateLimitStore(),
): Promise<void> {
  await store.reset(loginRateLimitKey(identity));
}

export type LoginAttemptResult =
  | { kind: "cooldown"; retryAfterSeconds: number }
  | { kind: "success" }
  | { kind: "invalid_credentials"; error: unknown; failure: LoginFailureResult }
  | { kind: "other_error"; error: unknown };

export async function runLoginAttempt(input: {
  identity: string;
  signIn: () => Promise<{ error: unknown | null }>;
  store?: LoginRateLimitStore;
}): Promise<LoginAttemptResult> {
  const store = input.store ?? getLoginRateLimitStore();
  const cooldown = await getLoginCooldown(input.identity, store);
  if (cooldown.blocked) {
    return { kind: "cooldown", retryAfterSeconds: cooldown.retryAfterSeconds };
  }

  const { error } = await input.signIn();
  if (!error) {
    await resetLoginFailures(input.identity, store);
    return { kind: "success" };
  }

  if (!isInvalidCredentialsError(error)) {
    return { kind: "other_error", error };
  }

  const failure = await recordLoginFailure(input.identity, store);
  return { kind: "invalid_credentials", error, failure };
}
