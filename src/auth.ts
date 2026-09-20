export type KtUser = {
  name: string;
  email: string;
  enrolled: string[];
  tracks: string[];
};

export type TrackId = "courses" | "marketing" | "programming" | "design";

const KEY = "kt-user";

/** Mock enrollment for testing — every simulated user gets 2 courses. */
export const DEFAULT_ENROLLED = ["python-data", "solidworks"];
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
    // migrate older records that predate enrollment/tracks
    const tracks = Array.isArray(u.tracks) && u.tracks.length > 0
      ? u.tracks
      : [...DEFAULT_TRACKS];
    const enrolled = Array.isArray(u.enrolled)
      ? u.enrolled
      : tracks.includes("courses")
        ? [...DEFAULT_ENROLLED]
        : [];
    const user = { name: u.name, email: u.email ?? "", enrolled, tracks };
    if (!Array.isArray(u.enrolled) || !Array.isArray(u.tracks)) setUser(user);
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
