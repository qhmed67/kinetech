// Supabase client factory with storage adapter (Phase 4a).
// Web: createSupabaseWebClient({ url, key, storage: localStorage adapter }) — behavior identical to prior singleton.
// Mobile: createSupabaseClient({ url, key, storage: expo-secure-store adapter, detectSessionInUrl: false }).
// Never expose the service-role key in either client. Never expose raw video URLs here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export function createSupabaseClient(opts: {
  url: string;
  key: string;
  storage?: StorageAdapter;
  detectSessionInUrl?: boolean;
  autoRefreshToken?: boolean;
}): SupabaseClient | null {
  if (!opts.url || !opts.key) return null;
  return createClient(opts.url, opts.key, {
    auth: {
      detectSessionInUrl: opts.detectSessionInUrl ?? false,
      autoRefreshToken: opts.autoRefreshToken ?? true,
      persistSession: true,
      storage: opts.storage as never,
    },
  });
}
