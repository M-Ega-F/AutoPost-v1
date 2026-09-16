import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { serverConfig } from "@/lib/env";
import { measurePerf } from "@/lib/perf";
import { currentRequestContext, recordRequestContextMetric } from "@/lib/request-context";

type CookieWriter = {
  set: (input: {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }) => void;
};

/**
 * Supabase client bound to the request cookies.
 * `setAll` is wrapped in try/catch because Server Components are not allowed to
 * write cookies; Route Handlers and Server Actions are.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    serverConfig.supabaseUrl,
    serverConfig.supabaseAnonKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>) => {
          try {
            const store = cookieStore as unknown as CookieWriter;
            for (const { name, value, options } of cookiesToSet) {
              store.set({ name, value, options });
            }
          } catch {
            // Called from a Server Component — the session refresh is handled
            // by `src/proxy.ts` instead.
          }
        },
      },
    },
  );
}

export async function getCurrentUser(): Promise<User | null> {
  const requestContext = currentRequestContext();
  if (requestContext?.currentUserPromise) {
    recordRequestContextMetric("authCacheHitCount");
    return requestContext.currentUserPromise;
  }

  recordRequestContextMetric("authResolveCount");
  const promise = getCurrentUserUncached();
  if (requestContext) requestContext.currentUserPromise = promise;
  return promise;
}

async function getCurrentUserUncached(): Promise<User | null> {
  const supabase = await measurePerf(
    "[PERF][shared-auth]",
    "supabase-client.create",
    () => createSupabaseServerClient(),
  );
  const {
    data: { user },
  } = await measurePerf(
    "[PERF][shared-auth]",
    "supabase.auth.getUser",
    () => supabase.auth.getUser(),
  );
  if (user) {
    const { ensurePersonalWorkspace } = await import("@/lib/domain/workspaces");
    await ensurePersonalWorkspace(user.id);
  }
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

/**
 * For Route Handlers, which must answer `401 Unauthorized` instead of sending
 * a browser redirect that an `fetch` caller cannot use.
 */
export async function getUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
