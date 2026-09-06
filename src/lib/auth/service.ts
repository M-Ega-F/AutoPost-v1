import { createClient } from "@supabase/supabase-js";

import { serverConfig } from "@/lib/env";

let cached: ReturnType<typeof createClient> | undefined;

/**
 * Service-role client for Supabase Storage. Tokens never travel through this
 * client — it is only used for signed media URLs and object management.
 */
export function getServiceSupabase() {
  if (!cached) {
    cached = createClient(serverConfig.supabaseUrl, serverConfig.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
