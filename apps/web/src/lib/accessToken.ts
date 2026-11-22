/** Read the signed-in user's access token for an API call.
 *
 * Used by the Worker tier (token refresh) and the YouTube fallback. It never
 * logs or stores the token; a missing session just returns null so callers can
 * degrade gracefully.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { supabase } = await import("./db/client");
    const sb = supabase();
    if (!sb) return null;
    const session = await Promise.race([
      sb.auth.getSession(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 10000)),
    ]);
    if (session && typeof session === "object" && "data" in session) {
      const s = (session as { data: { session: { access_token?: string } | null } }).data.session;
      return s?.access_token ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
