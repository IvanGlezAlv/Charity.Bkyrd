import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses Row Level Security, so it is used only for
 * operations that have no user-scoped equivalent (inviting staff accounts),
 * and only after the caller's role has been verified. Never import this from
 * a client component; the "server-only" import enforces that at build time.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  }
  return createClient(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
