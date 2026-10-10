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

/** Drop every local trace of a course: views + completions + sticky unlocks. */
export function purgeProgress(u: KtUser, slug: string): void {
  const uk = userKeyOf(u);
  try {
    const db = readDB();
    if (db[uk]) {
      for (const k of Object.keys(db[uk])) {
        if (k === slug || k.startsWith(`${slug}:`)) delete db[uk][k];
      }
      writeDB(db);
    }
  } catch {
    /* ignore */
  }
  try {
    const done = readDone();
    if (done[uk]?.[slug]) {
      const next = { ...done, [uk]: { ...(done[uk] ?? {}) } };
      delete next[uk][slug];
      window.localStorage.setItem(DONE_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
  try {
    const un = readUnlocked();
    if (un[uk]?.[slug]) {
      const next = { ...un, [uk]: { ...(un[uk] ?? {}) } };
      delete next[uk][slug];
      window.localStorage.setItem(UNLOCK_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Full server reconciliation for one course: local views AND done flags are
 * replaced wholesale by the server rows. Additive merge kept stale `done`
 * flags alive after admin restarts — this is the single truth sync.
 */
export function replaceProgress(
  u: KtUser,
  slug: string,
  rows: Array<{ idx: number; views: number; done: boolean; unlocked?: boolean }>,
): void {
  const uk = userKeyOf(u);
  try {
    const db = readDB();
    const kept: Record<string, number> = {};
    for (const [k, v] of Object.entries(db[uk] ?? {})) {
      if (k !== slug && !k.startsWith(`${slug}:`)) kept[k] = v;
    }
    for (const r of rows) {
      kept[videoKey(slug, r.idx)] = Math.min(MAX_VIEWS, Math.max(0, r.views));
    }
    db[uk] = kept;
    writeDB(db);
  } catch {
    /* ignore */
  }
  try {
    const done = readDone();
    const list = rows.filter((r) => r.done).map((r) => r.idx);
    window.localStorage.setItem(
      DONE_KEY,
      JSON.stringify({ ...done, [uk]: { ...(done[uk] ?? {}), [slug]: list } }),
    );
  } catch {
    /* ignore */
  }
  try {
    const un = readUnlocked();
    const list = rows.filter((r) => r.unlocked).map((r) => r.idx);
    window.localStorage.setItem(
      UNLOCK_KEY,
      JSON.stringify({ ...un, [uk]: { ...(un[uk] ?? {}), [slug]: list } }),
    );
  } catch {
    /* ignore */
  }
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
  // A permitted play opens the part for good (mirrors the server flag).
  setUnlockedFlag(u, slug, idx);
  pushPlay(slug, idx);
  return next;
}

/* Completion = watched to the end. Unlocks the NEXT lesson only. */
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
 * Completion requires genuinely watched time: >=80% of the real runtime.
 * The 3 views are a rewatch allowance, never a requirement — burning them
 * completes and unlocks nothing. Server re-checks the same rule.
 */
export function watchRequirementMet(
  _u: KtUser,
  _slug: string,
  _idx: number,
  watchedSecs: number,
  durationSecs = 0,
  nominalMins = 10,
): boolean {
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
/* Sticky unlock store: once a part opens it stays open — admin restarts
   of OTHER parts must never re-lock it. Mirrored from the server flag. */
const UNLOCK_KEY = "kt-unlocked";

type UnlockDB = Record<string, Record<string, number[]>>;

function readUnlocked(): UnlockDB {
  try {
    const raw = window.localStorage.getItem(UNLOCK_KEY);
    if (!raw) return {};
    const db = JSON.parse(raw) as UnlockDB;
    return db && typeof db === "object" ? db : {};
  } catch {
    return {};
  }
}

export function isUnlockedFlag(u: KtUser, slug: string, idx: number): boolean {
  return readUnlocked()[userKeyOf(u)]?.[slug]?.includes(idx) ?? false;
}

export function setUnlockedFlag(u: KtUser, slug: string, idx: number): void {
  const db = readUnlocked();
  const uk = userKeyOf(u);
  const list = db[uk]?.[slug] ?? [];
  if (list.includes(idx)) return;
  try {
    window.localStorage.setItem(
      UNLOCK_KEY,
      JSON.stringify({ ...db, [uk]: { ...(db[uk] ?? {}), [slug]: [...list, idx] } }),
    );
  } catch {
    /* ignore */
  }
}

/* Sequential unlocking: lesson N opens once lesson N-1 is DONE (a full
   genuine watch) — OR it was unlocked before (sticky: survives restarts of
   other parts). Burned views never unlock. */
export function isUnlocked(u: KtUser, slug: string, idx: number): boolean {
  if (idx <= 0) return true;
  if (isUnlockedFlag(u, slug, idx)) return true;
  return isDone(u, slug, idx - 1);
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
