import type { KtUser } from "./auth";

/* Watch-layer store. Local keys stay for instant sync UI; every play/done
   also pushes to Supabase RPCs (3-view cap + sequential lock enforced
   server-side) when configured. Server state hydrates over local on load. */

export const MAX_VIEWS = 3;
const VIEWS_KEY = "kt-views";

type ViewsDB = Record<string, Record<string, number>>;

function readDB(): ViewsDB {
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    if (!raw) return {};
    const db = JSON.parse(raw) as ViewsDB;
    return db && typeof db === "object" ? db : {};
  } catch {
    return {};
  }
}

function writeDB(db: ViewsDB) {
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

export function userKeyOf(u: KtUser): string {
  return (u.email || u.name || "student").toLowerCase();
}

export function videoKey(slug: string, idx: number): string {
  return `${slug}:${idx}`;
}

export function getViews(u: KtUser, slug: string, idx: number): number {
  return readDB()[userKeyOf(u)]?.[videoKey(slug, idx)] ?? 0;
}

export function viewsLeft(u: KtUser, slug: string, idx: number): number {
  return Math.max(0, MAX_VIEWS - getViews(u, slug, idx));
}

/** Cloud merge helper: server count wins (called by hydrate). */
export function setViewsCount(u: KtUser, slug: string, idx: number, n: number): void {
  const db = readDB();
  const uk = userKeyOf(u);
  const vk = videoKey(slug, idx);
  db[uk] = { ...(db[uk] ?? {}), [vk]: Math.min(MAX_VIEWS, Math.max(0, n)) };
  writeDB(db);
}

/** Cloud merge helper: mark done from server state. */
export function setDoneFlag(u: KtUser, slug: string, idx: number): void {
  const db = readDone();
  const uk = userKeyOf(u);
  const list = db[uk]?.[slug] ?? [];
  if (list.includes(idx)) return;
  try {
    window.localStorage.setItem(
      DONE_KEY,
      JSON.stringify({ ...db, [uk]: { ...(db[uk] ?? {}), [slug]: [...list, idx] } }),
    );
  } catch {
    /* ignore */
  }
}

function pushPlay(slug: string, idx: number): void {
  if (typeof window === "undefined") return;
  void import("./lib/db/sync")
    .then((m) => m.pushPlayToCloud(slug, idx))
    .catch(() => {
      /* offline — local count stays */
    });
}

/** A "play" counts once the video actually starts playing. */
export function recordPlay(u: KtUser, slug: string, idx: number): number {
  const db = readDB();
  const uk = userKeyOf(u);
  const vk = videoKey(slug, idx);
  const next = Math.min(MAX_VIEWS, (db[uk]?.[vk] ?? 0) + 1);
  db[uk] = { ...(db[uk] ?? {}), [vk]: next };
  writeDB(db);
  pushPlay(slug, idx);
  return next;
}

/* Completion = watched to the end (or burned all views).
   Unlocks the NEXT lesson only — no skipping ahead. */
const DONE_KEY = "kt-done";

type DoneDB = Record<string, Record<string, number[]>>;

function readDone(): DoneDB {
  try {
    const raw = window.localStorage.getItem(DONE_KEY);
    if (!raw) return {};
    const db = JSON.parse(raw) as DoneDB;
    return db && typeof db === "object" ? db : {};
  } catch {
    return {};
  }
}

export function isDone(u: KtUser, slug: string, idx: number): boolean {
  return readDone()[userKeyOf(u)]?.[slug]?.includes(idx) ?? false;
}

/**
 * Completion requires genuinely watched time: >=80% of the lesson's nominal
 * minutes, or burned views (>=3 plays, completion-equivalent per unlock rule).
 * Seek jumps are never counted (see Watch accumulator) — dragging to the end
 * no longer unlocks anything. Server re-checks against DB-side minutes.
 */
export function watchRequirementMet(
  u: KtUser,
  slug: string,
  idx: number,
  watchedSecs: number,
  durationSecs = 0,
  nominalMins = 10,
): boolean {
  if (getViews(u, slug, idx) >= MAX_VIEWS) return true;
  // Real media duration wins; nominal minutes label is only a fallback.
  // Client-side counts are UI hints only — the server re-validates.
  const need = durationSecs > 0 ? durationSecs * 0.8 : nominalMins * 60 * 0.8;
  if (need > 0 && watchedSecs >= need) return true;
  return false;
}

export function recordDone(
  u: KtUser,
  slug: string,
  idx: number,
  watchedSecs = 0,
  durationSecs = 0,
  nominalMins = 10,
): boolean {
  if (!watchRequirementMet(u, slug, idx, watchedSecs, durationSecs, nominalMins)) return false;
  setDoneFlag(u, slug, idx);
  if (typeof window === "undefined") return true;
  void import("./lib/db/sync")
    .then((m) => m.pushDoneToCloud(slug, idx, watchedSecs, durationSecs))
    .catch(() => {
      /* offline — local flag stays */
    });
  return true;
}

/** Testing helper: wipe this user's views + completions so the watch flow can be retested. */
export function resetProgress(u: KtUser): void {
  const uk = userKeyOf(u);
  try {
    const db = readDB();
    delete db[uk];
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
  try {
    const done = readDone();
    delete done[uk];
    window.localStorage.setItem(DONE_KEY, JSON.stringify(done));
  } catch {
    /* ignore */
  }
}
/* Sequential unlocking: lesson N opens once lesson N-1 is FINISHED. */
export function isUnlocked(u: KtUser, slug: string, idx: number): boolean {
  if (idx <= 0) return true;
  const prev = idx - 1;
  return isDone(u, slug, prev) || getViews(u, slug, prev) >= MAX_VIEWS;
}

/* ---------------------------------------------------------------
   DEFAULT VIDEO — every built-in course uses the bundled sample
   until real per-course files are uploaded via the admin dashboard.
---------------------------------------------------------------- */
const LOCAL_VIDEO = "assets/vid.mp4";

export const VIDEO_SOURCES: Record<string, string[]> = {
  "python-data": [LOCAL_VIDEO, LOCAL_VIDEO, LOCAL_VIDEO, LOCAL_VIDEO],
  robotics: [LOCAL_VIDEO, LOCAL_VIDEO, LOCAL_VIDEO, LOCAL_VIDEO],
  solidworks: [LOCAL_VIDEO, LOCAL_VIDEO, LOCAL_VIDEO, LOCAL_VIDEO],
};

export function videoSource(slug: string, idx: number): string | null {
  return VIDEO_SOURCES[slug]?.[idx] ?? null;
}

/** Mock runtimes (minutes) shown in the sidebar. Needs real data. */
export const VIDEO_MINS = [12, 18, 15, 22];

/** Mock supplementary links. Empty array = row hidden entirely. */
export type ResKind = "assign" | "exam";
export const VIDEO_RES: Record<string, Record<number, ResKind[]>> = {
  "python-data": { 0: ["assign"], 1: ["exam"], 3: ["assign"] },
  robotics: { 0: ["assign"], 2: ["exam"] },
  solidworks: { 1: ["assign"], 2: ["exam"] },
};

export function videoRes(slug: string, idx: number): ResKind[] {
  return VIDEO_RES[slug]?.[idx] ?? [];
}
