import { getSupabase } from "./lib/supabase";
import {
  notifyUserChanged,
  subscribeUserChanged,
  type KtUser,
  type TrackId,
} from "./userBus";

export type { KtUser, TrackId } from "./userBus";
export { DEFAULT_TRACKS, subscribeUserChanged, notifyUserChanged } from "./userBus";

/* The user record (profile + grants + tracks) lives in the DB and is cached
 * by src/lib/sync.ts (SecureStore) — the web's localStorage cache. Reads go
 * through the cache; the session restore hydrates it on app mount. */
export async function getUser(): Promise<KtUser | null> {
  const { ensureUserCache, getUser: cached } = await import("./lib/sync");
  await ensureUserCache();
  return cached();
}

export function setUser(u: KtUser) {
  void (async () => {
    const { setUser: cacheSet } = await import("./lib/sync");
    cacheSet(u);
  })();
  notifyUserChanged();
}

/* Supabase auth path for mobile */
export async function signUpWithDb(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  nationalId?: string;
  grade?: "sec1" | "sec2";
  track: TrackId;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.name,
        phone: input.phone,
        national_id: input.nationalId,
        grade: input.grade,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error("signup failed");

  // Insert user profile
  const { error: profileError } = await sb.from("profiles").insert({
    id: data.user.id,
    email: input.email,
    name: input.name,
    phone: input.phone,
    national_id: input.nationalId ?? null,
    grade: input.grade ?? null,
    role: "student",
  });

  if (profileError) throw profileError;

  // Set user track
  const { error: trackError } = await sb
    .from("user_tracks")
    .insert({ user_id: data.user.id, track: input.track });

  if (trackError) throw trackError;

  // Cache the local identity
  const { setUser: cacheSet } = await import("./lib/sync");
  cacheSet({
    name: input.name,
    email: input.email,
    phone: input.phone,
    enrolled: [],
    tracks: [input.track],
    role: "student",
    banned: false,
  });

  notifyUserChanged();
}

export async function signInWithDb(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error("login failed");

  // Hydrate the full profile through the session restore (single source).
  const { restoreDbSession } = await import("./lib/sync");
  const restored = await restoreDbSession();
  if (!restored) throw new Error("login failed");
}

export async function signOutEverywhere(): Promise<void> {
  try {
    const sb = getSupabase();
    if (sb) {
      await sb.auth.signOut();
    }
  } catch {
    /* no cloud session */
  }
  const { setUser: cacheSet } = await import("./lib/sync");
  cacheSet(null);
  notifyUserChanged();
}

export function clearUser() {
  void (async () => {
    const { setUser: cacheSet } = await import("./lib/sync");
    cacheSet(null);
    notifyUserChanged();
  })();
}

export function initialsOf(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "KT";
}
