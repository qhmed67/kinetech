/* Env-only module: zero dependencies, safe to import anywhere without
   pulling @supabase/supabase-js into the main bundle. */

export function getSupabaseEnv(): { url: string; key: string } {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseEnv();
  return url.length > 0 && key.length > 0;
}
