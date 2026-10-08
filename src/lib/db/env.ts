/* Env-only module: zero dependencies, safe to import anywhere without
   pulling @supabase/supabase-js into the main bundle. */

export function getSupabaseEnv(): { url: string; key: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.VITE_SUPABASE_URL ?? "";
  // Canonical name first, legacy alias as fallback. Never hardcode either.
  const key = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseEnv();
  return url.length > 0 && key.length > 0;
}
