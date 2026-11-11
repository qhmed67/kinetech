/* Web sync.ts student-side port (apps/web/src/lib/db/sync.ts): DB session
 * restore with a SecureStore-cached KtUser (the web's localStorage cache),
 * grants reconciliation (revoked/re-granted courses purge local progress),
 * and track persistence. Uses the same tables + RPCs. */

import * as SecureStore from "expo-secure-store";
import { getSupabase } from "./supabase";
import { NETWORK_TIMEOUT_MS, withTimeout } from "./db/throttle";
import {
  DEFAULT_TRACKS,
  notifyUserChanged,
  type KtUser,
  type TrackId,
} from "../userBus";
import { purgeProgress, purgeAllProgress } from "./watch";

const USER_KEY = "kt-user-cache";

let memUser: KtUser | null = null;
let cacheReady: Promise<void> | null = null;

/** Load the cached user once before reads (mirrors web localStorage). */
export async function ensureUserCache(): Promise<void> {
  if (memUser !== null) return;
  if (cacheReady) return cacheReady;
  cacheReady = (async () => {
    try {
      const raw = await SecureStore.getItemAsync(USER_KEY);
      if (raw) memUser = JSON.parse(raw) as KtUser;
    } catch {
      /* no cache */
    }
    // No cached profile: keep the module-level default (null) — the session
    // restore supplies the real identity.
  })();
  return cacheReady;
}

/** Cached user (instant). Call ensureUserCache() on app mount. */
export function getUser(): KtUser | null {
  return memUser;
}

export function setUser(u: KtUser | null): void {
  memUser = u;
  if (u) {
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)).catch(() => {
      /* cache-only */
    });
  } else {
    void SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: "student" | "admin";
  tracks: TrackId[];
  enrolled: string[];
  banned: boolean;
};

export async function loadSessionUser(uid: string): Promise<SessionUser> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const [{ data: p, error }, { data: tr }, { data: en }] = await withTimeout(
    Promise.all([
      sb.from("profiles").select("id,email,name,phone,role,banned").eq("id", uid).single(),
      sb.from("user_tracks").select("track").eq("user_id", uid),
      sb.from("enrollments").select("courses!inner(slug)").eq("user_id", uid),
    ]),
    NETWORK_TIMEOUT_MS,
    "session",
  );
  if (error || !p) throw error ?? new Error("profile missing");
  const prof = p as { id: string; email: string; name: string; phone: string | null; role: "student" | "admin"; banned: boolean };
  const enRows = (en ?? []) as unknown as Array<{ courses: { slug: string } | Array<{ slug: string }> }>;
  return {
    id: prof.id,
    email: prof.email,
    name: prof.name,
    phone: prof.phone ?? "",
    role: prof.role,
    tracks: ((tr ?? []) as { track: TrackId }[]).map((t) => t.track),
    enrolled: enRows
      .map((e) => (Array.isArray(e.courses) ? e.courses[0]?.slug : e.courses.slug))
      .filter(Boolean) as string[],
    banned: prof.banned ?? false,
  };
}

/** DB -> local session restore. No profile row (admin-deleted) kills the
    whole session so the orphan can never linger signed in. */
export async function restoreDbSession(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data } = await withTimeout(sb.auth.getSession(), NETWORK_TIMEOUT_MS, "session");
    const uid = data.session?.user.id;
    if (!uid) return false;
    let s: SessionUser;
    try {
      s = await loadSessionUser(uid);
    } catch (ex) {
      if (ex instanceof Error && ex.message === "profile missing") {
        // Profile row gone (admin-deleted) but the auth account survives:
        // kill the whole session so the orphan can never linger signed in.
        try {
          await sb.auth.signOut();
        } catch {
          /* already gone */
        }
        setUser(null);
        notifyUserChanged();
      }
      return false;
    }
    const local = getUser();
    setUser({
      name: s.name || local?.name || "Student",
      email: s.email,
      phone: s.phone || local?.phone || "",
      // Admin-granted slugs win; banned wins over everything.
      enrolled: [...s.enrolled],
      tracks: s.tracks.length > 0 ? [...s.tracks] : local?.tracks ?? [...DEFAULT_TRACKS],
      role: s.role,
      banned: s.banned,
    });
    notifyUserChanged();
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-adopt server grants mid-session. Revoked courses vanish with their
 * local progress purged (no ghost bars); RE-granted courses also start
 * clean — stale local counts from a previous enrollment must not resurrect.
 */
export async function syncMyGrants(): Promise<boolean> {
  const before = getUser();
  const beforeSet = new Set(before?.enrolled ?? []);
  let changed = false;
  try {
    changed = await restoreDbSession();
  } catch {
    return false;
  }
  const after = getUser();
  if (after) {
    const now = new Set(after.enrolled ?? []);
    for (const slug of beforeSet) {
      if (!now.has(slug)) purgeProgress(after, slug);
    }
    for (const slug of now) {
      if (!beforeSet.has(slug)) purgeProgress(after, slug);
    }
  }
  return changed;
}

/** Persist a newly activated dashboard space server-side (owner-only RLS). */
export async function addTrackToCloud(track: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data } = await withTimeout(sb.auth.getSession(), NETWORK_TIMEOUT_MS, "session");
    const uid = data.session?.user.id;
    if (!uid) return;
    await sb.from("user_tracks").upsert(
      { user_id: uid, track },
      { onConflict: "user_id,track" },
    );
  } catch {
    /* offline — local space stays, syncs on next bootstrap if track persists */
  }
}

/** Admin full-delete helper: wipe every local trace of one email. */
export async function purgeAllFor(email: string): Promise<void> {
  purgeAllProgress(email);
}

/** App-mount bootstrap: restore the DB session (grants + tracks). */
export async function bootstrapFromCloud(onUser: () => void): Promise<void> {
  await ensureUserCache();
  const changed = await restoreDbSession().catch(() => false);
  if (changed) onUser();
}
