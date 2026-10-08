export type KtUser = {
  name: string;
  email: string;
  /** Verified contact for watermark + support. Never a secret. */
  phone: string;
  /** Approved course slugs only — populated by server, never self-granted. */
  enrolled: string[];
  tracks: string[];
};

export type TrackId = "courses" | "marketing" | "programming" | "design";

const KEY = "kt-user";

export const DEFAULT_TRACKS: string[] = ["courses"];

/** Signup category (data-en value) → account track. */
export function trackForCategory(cat: string): TrackId {
  if (cat.includes("Marketing")) return "marketing";
  if (cat.includes("Software")) return "programming";
  if (cat.includes("Design")) return "design";
  return "courses";
}

export function getUser(): KtUser | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Partial<KtUser>;
    if (typeof u.name !== "string" || !u.name) return null;
    // migrate older records that predate enrollment/tracks/phone.
    // No enrollment model (WhatsApp-only): access = signed-in user.
    const tracks = Array.isArray(u.tracks) && u.tracks.length > 0
      ? u.tracks
      : [...DEFAULT_TRACKS];
    const enrolled = Array.isArray(u.enrolled) ? u.enrolled : [];
    const phone = typeof u.phone === "string" ? u.phone : "";
    const user = { name: u.name, email: u.email ?? "", phone, enrolled, tracks };
    if (!Array.isArray(u.enrolled) || !Array.isArray(u.tracks) || typeof u.phone !== "string") setUser(user);
    return user;
  } catch {
    return null;
  }
}

export function setUser(u: KtUser) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}

/* Same-tab reactivity: App subscribes; cloud sync notifies after adopting
   the server session (storage events only fire cross-tab). */
type UserListener = () => void;
const userListeners = new Set<UserListener>();

export function subscribeUserChanged(fn: UserListener): () => void {
  userListeners.add(fn);
  return () => {
    userListeners.delete(fn);
  };
}

export function notifyUserChanged(): void {
  userListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/* Supabase auth path (static signin/signup pages stay local-first until
   converted; these wrappers + restore-on-mount bridge the two). */
export async function signUpWithDb(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  nationalId?: string;
  grade?: "sec1" | "sec2";
  track: TrackId;
}): Promise<void> {
  const { signUpDb } = await import("./lib/db/authDb");
  const s = await signUpDb(input);
  setUser({ name: s.name, email: s.email, phone: s.phone, enrolled: s.enrolled, tracks: s.tracks });
  notifyUserChanged();
}

export async function signInWithDb(email: string, password: string): Promise<void> {
  const { signInDb } = await import("./lib/db/authDb");
  const s = await signInDb(email, password);
  setUser({ name: s.name, email: s.email, phone: s.phone, enrolled: s.enrolled, tracks: s.tracks });
  notifyUserChanged();
}

export async function signOutEverywhere(): Promise<void> {
  // Purge cloud caches first so no counts/ids leak into the next account.
  try {
    const sync = await import("./lib/db/sync");
    sync.clearCloudCache();
  } catch {
    /* offline */
  }
  try {
    const { resetAdminCache } = await import("./lib/db/adminGuard");
    resetAdminCache();
  } catch {
    /* offline */
  }
  try {
    const { signOutDb } = await import("./lib/db/authDb");
    await signOutDb();
  } catch {
    /* no cloud session */
  }
  clearUser();
  notifyUserChanged();
}

export function clearUser() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function initialsOf(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "KT";
}
