import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverConfig } from "@/lib/env";
import * as schema from "./schema";

export { schema };

/**
 * A single pooled connection used by the Next.js server and by the worker.
 *
 * RLS is defined for the `authenticated` role (see
 * `supabase/migrations/0001_rls_policies.sql`); this connection is privileged,
 * so every query in `src/lib/domain/**` filters on the caller's `user_id`.
 * Ownership is enforced in the domain layer, never trusted from the client.
 */
function createConnection() {
  return postgres(serverConfig.databaseUrl, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: process.env.DATABASE_SSL === "false" ? false : "require",
  });
}

let connection: ReturnType<typeof createConnection> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getConnection() {
  if (!connection) connection = createConnection();
  return connection;
}

export function getDb() {
  if (!database) database = drizzle(getConnection(), { schema });
  return database;
}

type Database = ReturnType<typeof getDb>;

/** Convenience alias so call sites read `db.select(...)`. */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = (instance as unknown as Record<string | symbol, unknown>)[
      property
    ];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function closeDb() {
  if (connection) {
    await connection.end({ timeout: 5 });
    connection = undefined;
    database = undefined;
  }
}

export * from "./schema";
