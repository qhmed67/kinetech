import type { KtUser } from "./auth";

/* Watch-layer mock store. Everything lives in localStorage, same
   pattern as the rest of the mock system. No backend, no real API. */

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

/** A "play" counts once the video actually starts playing. */
export function recordPlay(u: KtUser, slug: string, idx: number): number {
  const db = readDB();
  const uk = userKeyOf(u);
  const vk = videoKey(slug, idx);
  const next = Math.min(MAX_VIEWS, (db[uk]?.[vk] ?? 0) + 1);
  db[uk] = { ...(db[uk] ?? {}), [vk]: next };
  writeDB(db);
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

export function recordDone(u: KtUser, slug: string, idx: number): void {
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

/* Sequential unlocking: lesson N opens once lesson N-1 is FINISHED. */
export function isUnlocked(u: KtUser, slug: string, idx: number): boolean {
  if (idx <= 0) return true;
  const prev = idx - 1;
  return isDone(u, slug, prev) || getViews(u, slug, prev) >= MAX_VIEWS;
}

/* ---------------------------------------------------------------
   PLACEHOLDER VIDEO SOURCES — REPLACE WITH REAL FILES.
   The user will provide actual per-course video files or embeds.
   Adapter-ready: when moving to YouTube/Vimeo/Stream, add
   { kind: "embed", embedUrl } handling in the player component.
---------------------------------------------------------------- */
const SAMPLES = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
];

export const VIDEO_SOURCES: Record<string, string[]> = {
  "python-data": [
    "assets/vid.mp4",
    SAMPLES[1],
    SAMPLES[2],
    SAMPLES[3],
  ],
  robotics: [SAMPLES[1], SAMPLES[2], SAMPLES[3], SAMPLES[0]],
  solidworks: [SAMPLES[2], SAMPLES[3], SAMPLES[0], SAMPLES[1]],
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
