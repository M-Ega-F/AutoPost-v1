import { readdirSync, readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/lib/db/schema";

/**
 * A real Postgres (PGlite, WASM) standing in for Supabase during integration
 * tests. Real SQL means the things that actually matter — the atomic
 * `pending -> processing` claim, transactions, foreign keys and row locking —
 * are exercised for real instead of being mocked away.
 *
 * Only `src/test/**` is test-only; this module is swapped in for `@/lib/db` by
 * `src/test/register.ts`, so no production code imports it.
 */

const DDL_PATHS = readdirSync("drizzle")
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort()
  .map((file) => `drizzle/${file}`);

type Database = ReturnType<typeof drizzle<typeof schema>>;

let client: PGlite | undefined;
let database: Database | undefined;
let ready: Promise<void> | undefined;

function getClient(): PGlite {
  if (!client) client = new PGlite();
  return client;
}

export async function initTestDatabase(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const pg = getClient();

      // Supabase provides this; the schema's foreign keys point at it.
      await pg.exec(`
        create schema if not exists auth;
        create table if not exists auth.users (id uuid primary key, email text);
      `);

      for (const ddlPath of DDL_PATHS) {
        await pg.exec(readFileSync(ddlPath, "utf8"));
      }

      database = drizzle(pg, { schema });
    })();
  }

  await ready;
}

/**
 * postgres-js (production) resolves `execute()` to an array of rows; the PGlite
 * driver resolves it to `{ rows }`. Production code reads an array, so the
 * harness normalises the shape — the driver difference must not leak into tests.
 */
function normalizeExecuteResult(result: unknown): unknown {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: unknown }).rows;
  }
  return result;
}

type AnyDb = Record<string | symbol, unknown>;

function wrapExecutor<T extends AnyDb>(target: T): T {
  return new Proxy(target, {
    get(current, property, receiver) {
      if (property === "execute") {
        const original = Reflect.get(current, property, receiver) as (
          query: unknown,
        ) => Promise<unknown>;
        return (query: unknown) => original.call(current, query).then(normalizeExecuteResult);
      }

      if (property === "transaction") {
        const original = Reflect.get(current, property, receiver) as (
          fn: (tx: AnyDb) => Promise<unknown>,
        ) => Promise<unknown>;
        return (fn: (tx: AnyDb) => Promise<unknown>) =>
          original.call(current, (tx: AnyDb) => fn(wrapExecutor(tx)));
      }

      const value = Reflect.get(current, property, receiver);
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as T;
}

export function getDb(): Database {
  if (!database) {
    throw new Error("initTestDatabase() must be awaited before using the database.");
  }
  return database;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = wrapExecutor(getDb() as unknown as AnyDb) as unknown as AnyDb;
    const value = instance[property];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function resetTestDatabase(): Promise<void> {
  await initTestDatabase();
  await getClient().exec(`
    truncate table
      webhook_deliveries, webhooks, post_review_events, post_analytics_snapshots, post_executions, post_platforms, post_media, posts, content_templates,
      social_accounts, user_preferences, media_assets, notifications, workspace_invitations, workspace_members, workspaces, auth.users
    restart identity cascade;
  `);
}

/** Inserts the auth user a foreign key will need, plus nothing else. */
export async function seedUser(userId: string, email?: string): Promise<void> {
  await initTestDatabase();
  await getClient().query(
    "insert into auth.users (id, email) values ($1, $2) on conflict (id) do update set email = excluded.email",
    [userId, email ?? userId + "@example.com"],
  );
}

export async function closeDb(): Promise<void> {
  // Nothing to close: the in-memory database dies with the process.
}

export { schema };
export * from "@/lib/db/schema";
