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

/* Bell dropdown feed: ONE merged recency list, not two capped sections.
   Sessions + general rows interleave purely by date (newest first, FIFO
   priority) and truncate to a preview count — the bell is a preview, the
   dashboard widgets are the full centers. Dependency-free like the rest. */

export type ActivitySession = { id: string; title: string; date: string };
export type ActivityNotice = { id: string; title: string; message: string; is_read: boolean; created_at: string };

export type ActivityItem = {
  id: string;
  title: string;
  message: string;
  date: string;
  kind: "lesson" | "notice";
  unread: boolean;
};

export function mergeActivity(
  sessions: ActivitySession[],
  notifs: ActivityNotice[],
  limit: number,
  seenSessionsIso: string | null,
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...sessions.map((s) => ({
      id: `s-${s.id}`,
      title: s.title,
      message: "",
      date: s.date,
      kind: "lesson" as const,
      unread: seenSessionsIso !== null && s.date > seenSessionsIso,
    })),
    ...notifs.map((n) => ({
      id: `n-${n.id}`,
      title: n.title,
      message: n.message,
      date: n.created_at,
      kind: "notice" as const,
      unread: !n.is_read,
    })),
  ];
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items.slice(0, Math.max(0, limit));
}
