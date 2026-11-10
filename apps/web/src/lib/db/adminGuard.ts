import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "./env";

/* Verified admin gate. The legacy localStorage flag (kt-admin) is trivially
   forgeable via DevTools, so when Supabase is configured the panel requires a
   server-verified profiles.role='admin' read. Offline keeps the legacy flag. */

export type AdminState = "checking" | "admin" | "denied";

const ADMIN_CACHE_TTL_MS = 10 * 60 * 1000;
let cached: { uid: string; admin: boolean; at: number } | null = null;
let inflight: Promise<boolean> | null = null;

export function resetAdminCache(): void {
  cached = null;
  inflight = null;
}

export async function checkAdmin(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    // Lazy client import: keeps @supabase/supabase-js out of the main bundle.
    const { supabase } = await import("./client");
    const sb = supabase();
    if (!sb) return false;
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) {
      cached = null;
      return false;
    }
    // Time-boxed cache: a demoted admin loses panel access within minutes,
    // even on shared devices where nobody logs out.
    if (cached && cached.uid === uid && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) {
      return cached.admin;
    }
    if (!inflight) {
      inflight = (async () => {
        const s = supabase();
        if (!s) return false;
        const { data: p } = await s.from("profiles").select("role").eq("id", uid).single();
        return (p as unknown as { role: string } | null)?.role === "admin";
      })().finally(() => {
        inflight = null;
      });
    }
    const admin = await inflight;
    cached = { uid, admin, at: Date.now() };
    return admin;
  } catch {
    return false;
  }
}

const ADMIN_CHECK_TIMEOUT_MS = 8000;

export function useVerifiedAdmin(): AdminState {
  const [state, setState] = useState<AdminState>("checking");
  useEffect(() => {
    let alive = true;
    if (!isSupabaseConfigured()) {
      setState("checking");
      return;
    }
    // Fail closed on hangs: no infinite loading, no silent grant.
    const timer = window.setTimeout(() => {
      if (alive) setState("denied");
    }, ADMIN_CHECK_TIMEOUT_MS);
    void checkAdmin()
      .then((admin) => {
        if (alive) setState(admin ? "admin" : "denied");
      })
      .catch(() => {
        if (alive) setState("denied");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
