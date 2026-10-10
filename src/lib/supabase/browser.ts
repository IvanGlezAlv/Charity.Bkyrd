"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client (anon key + session cookies). Used for Realtime subscriptions. */
export function getBrowserClient() {
  if (!client) client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}
