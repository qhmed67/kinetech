/* Lessons-badge attention marker: which session rows the user has SEEN.
   Local mirror of ATTENTION, never data — the rows themselves always come
   from the DB. Badge = rows newer than the marker; visiting the overview
   (or opening the bell) marks seen. Dependency-free on purpose: imported
   statically by chrome components without dragging the Supabase client in. */

const KEY = "kt-seen-sessions";
export const SESSIONS_SEEN_EVENT = "kt-sessions-seen";

export function readSeenSessionsIso(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markSessionsSeen(iso?: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, iso ?? new Date().toISOString());
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(SESSIONS_SEEN_EVENT));
  } catch {
    /* ignore */
  }
}
