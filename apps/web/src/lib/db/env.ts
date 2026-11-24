/* Env-only module: zero dependencies, safe to import anywhere without
   pulling @supabase/supabase-js into the main bundle. */

export function getSupabaseEnv(): { url: string; key: string } {
  // Read every variable as a MEMBER of import.meta.env, never the object
  // itself: Vite serializes a bare `import.meta.env` into the bundle as a
  // whole object, which ships EVERY VITE_* variable of the build scope —
  // including retired ones (the VITE_DRIVE_BROWSER_KEY Google key did leak
  // into the preview bundle that way). Member access inlines only the two
  // public values below, so nothing else can ever reach the browser.
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  // Canonical name first, legacy alias as fallback. Never hardcode either.
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseEnv();
  return url.length > 0 && key.length > 0;
}
