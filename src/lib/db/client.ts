import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv, isSupabaseConfigured } from "./env";

export { isSupabaseConfigured };

let client: SupabaseClient | null = null;

/** Singleton. Returns null when .env is incomplete (mock fallback stays active). */
export function supabase(): SupabaseClient | null {
  const { url, key } = getSupabaseEnv();
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createClient(url, key);
  return client;
}
