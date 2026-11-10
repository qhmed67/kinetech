import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "@kinetech/core";
import { getSupabaseEnv, isSupabaseConfigured } from "./env";

export { isSupabaseConfigured };

let client: SupabaseClient | null = null;

/** Singleton via core factory. Returns null when .env is incomplete (mock fallback stays active). */
export function supabase(): SupabaseClient | null {
  const { url, key } = getSupabaseEnv();
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createSupabaseClient({ url, key }) as SupabaseClient | null;
  return client;
}
