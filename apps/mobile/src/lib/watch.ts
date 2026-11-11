/* Web watch-layer store port (apps/web/src/watch.ts). Local keys stay for
 * instant sync UI; every play/done also pushes to Supabase RPCs (3-view cap
 * + sequential lock enforced server-side) when configured. Server state
 * hydrates over local on load. Storage is SecureStore (async) with an
 * in-memory cache — screens await ensureWatchCache() once before reads. */

import * as SecureStore from "expo-secure-store";
import { completeVideo, recordPlay as recordPlayDb, touchUnlocked } from "./db/watch";
import type { KtUser } from "../authDb";

export const MAX_VIEWS = 3;
const VIEWS_KEY = "kt-views";
const DONE_KEY = "kt-done";
const UNLOCK_KEY = "kt-unlocked";

type ViewsDB = Record<string, Record<string, number>>;
type ListDB = Record<string, Record<string, number[]>>;

const mem: { views: ViewsDB; done: ListDB; unlocked: ListDB } = {
  views: {},
  done: {},
  unlocked: {},
};

let loaded = false;
let loadPromise: Promise<void> | null = null;

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persist(key: string, value: unknown): void {
  void SecureStore.setItemAsync(key, JSON.stringify(value)).catch(() => {
    /* local cache only */
  });
}

/** Screens call this once (e.g. on mount) before reading watch state. */
export async function ensureWatchCache(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const [v, d, u] = await Promise.all([
      readJson(VIEWS_KEY),
      readJson(DONE_KEY),
      readJson(UNLOCK_KEY),
    ]);
    if (v && typeof v === "object") mem.views = v as ViewsDB;
    if (d && typeof d === "object") mem.done = d as ListDB;
    if (u && typeof u === "object") mem.unlocked = u as ListDB;
    loaded = true;
  })();
  return loadPromise;
}

export function userKeyOf(u: KtUser): string {
  return (u.email || u.name || "student").toLowerCase();
}

export function videoKey(slug: string, idx: number): string {
  return `${slug}:${idx}`;
}

export function getViews(u: KtUser, slug: string, idx: number): number {
  return mem.views[userKeyOf(u)]?.[videoKey(slug, idx)] ?? 0;
}

export function viewsLeft(u: KtUser, slug: string, idx: number): number {
  return Math.max(0, MAX_VIEWS - getViews(u, slug, idx));
}

/** Cloud merge helper: server count wins (called by hydrate). */
export function setViewsCount(u: KtUser, slug: string, idx: number, n: number): void {
  const db = mem.views;
  const uk = userKeyOf(u);
  const vk = videoKey(slug, idx);
  db[uk] = { ...(db[uk] ?? {}), [vk]: Math.min(MAX_VIEWS, Math.max(0, n)) };
  persist(VIEWS_KEY, db);
}

/** Drop every local trace of a course: views + completions + sticky unlocks. */
export function purgeProgress(u: KtUser, slug: string): void {
  const uk = userKeyOf(u);
  const db = mem.views;
  if (db[uk]) {
    const kept: Record<string, number> = {};
    for (const [k, v] of Object.entries(db[uk])) {
      if (k !== slug && !k.startsWith(`${slug}:`)) kept[k] = v;
    }
    db[uk] = kept;
    persist(VIEWS_KEY, db);
  }
  const done = mem.done;
  if (done[uk]?.[slug]) {
    const next = { ...done, [uk]: { ...(done[uk] ?? {}) } };
    delete next[uk][slug];
    mem.done = next;
    persist(DONE_KEY, next);
  }
  const un = mem.unlocked;
  if (un[uk]?.[slug]) {
    const next = { ...un, [uk]: { ...(un[uk] ?? {}) } };
    delete next[uk][slug];
    mem.unlocked = next;
    persist(UNLOCK_KEY, next);
  }
}

/** Drop EVERY local trace of one person (by email): all courses' views,
    completions, and sticky unlocks. Used after an admin full-delete so a
    same-device re-register starts at absolute zero. */
export function purgeAllProgress(email: string): void {
  const uk = (email || "").toLowerCase();
  if (!uk) return;
  if (mem.views[uk]) {
    delete mem.views[uk];
    persist(VIEWS_KEY, mem.views);
  }
  if (mem.done[uk]) {
    const next = { ...mem.done };
    delete next[uk];
    mem.done = next;
    persist(DONE_KEY, next);
  }
  if (mem.unlocked[uk]) {
    const next = { ...mem.unlocked };
    delete next[uk];
    mem.unlocked = next;
    persist(UNLOCK_KEY, next);
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
  const db = mem.views;
  const kept: Record<string, number> = {};
  for (const [k, v] of Object.entries(db[uk] ?? {})) {
    if (k !== slug && !k.startsWith(`${slug}:`)) kept[k] = v;
  }
  for (const r of rows) {
    kept[videoKey(slug, r.idx)] = Math.min(MAX_VIEWS, Math.max(0, r.views));
  }
  db[uk] = kept;
  persist(VIEWS_KEY, db);

  const list = rows.filter((r) => r.done).map((r) => r.idx);
  mem.done = { ...mem.done, [uk]: { ...(mem.done[uk] ?? {}), [slug]: list } };
  persist(DONE_KEY, mem.done);

  const unList = rows.filter((r) => r.unlocked).map((r) => r.idx);
  mem.unlocked = { ...mem.unlocked, [uk]: { ...(mem.unlocked[uk] ?? {}), [slug]: unList } };
  persist(UNLOCK_KEY, mem.unlocked);
}

/** Cloud merge helper: mark done from server state. */
export function setDoneFlag(u: KtUser, slug: string, idx: number): void {
  const db = mem.done;
  const uk = userKeyOf(u);
  const list = db[uk]?.[slug] ?? [];
  if (list.includes(idx)) return;
  mem.done = { ...db, [uk]: { ...(db[uk] ?? {}), [slug]: [...list, idx] } };
  persist(DONE_KEY, mem.done);
}

/* Cloud push: fire-and-forget server count (local already updated for
   instant UI). Rapid repeats coalesce: concurrent push runs trailing-edge
   so no play is ever dropped. */

const videoIds = new Map<string, string | null>();
const playInflight = new Set<string>();
const playQueued = new Set<string>();

function vk(slug: string, idx: number): string {
  return `${slug}:${idx}`;
}

async function resolveVideoId(slug: string, idx: number): Promise<string | null> {
  const hit = videoIds.get(vk(slug, idx));
  if (hit) return hit;
  const sb = (await import("./supabase")).getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.from("videos").select("id,courses!inner(slug)")
      .eq("courses.slug", slug).eq("sort_order", idx).single();
    const id = (data as unknown as { id: string } | null)?.id ?? null;
    if (id) videoIds.set(vk(slug, idx), id);
    return id;
  } catch {
    return null;
  }
}

export async function pushPlayToCloud(slug: string, idx: number): Promise<void> {
  const k = vk(slug, idx);
  if (playInflight.has(k)) {
    playQueued.add(k);
    return;
  }
  playInflight.add(k);
  try {
    do {
      playQueued.delete(k);
      try {
        const id = await resolveVideoId(slug, idx);
        if (id) await recordPlayDb(id);
      } catch {
        /* offline / not enrolled — server enforces on its side when available */
      }
    } while (playQueued.has(k));
  } finally {
    playInflight.delete(k);
  }
}

export async function pushDoneToCloud(
  slug: string,
  idx: number,
  watchedSecs = 0,
  durationSecs = 0,
  ended = false,
): Promise<void> {
  try {
    const id = await resolveVideoId(slug, idx);
    if (id) await completeVideo(id, watchedSecs, durationSecs, ended);
  } catch {
    /* offline / requirement unmet — local decides UI, server decides truth */
  }
}

/** A "play" counts once the video actually starts playing. */
export function recordPlay(u: KtUser, slug: string, idx: number): number {
  const db = mem.views;
  const uk = userKeyOf(u);
  const key = videoKey(slug, idx);
  const next = Math.min(MAX_VIEWS, (db[uk]?.[key] ?? 0) + 1);
  db[uk] = { ...(db[uk] ?? {}), [key]: next };
  persist(VIEWS_KEY, db);
  // A permitted play opens the part for good (mirrors the server flag).
  setUnlockedFlag(u, slug, idx);
  void pushPlayToCloud(slug, idx).catch(() => {
    /* offline — local count stays */
  });
  return next;
}

/* Completion = watched to the end. Unlocks the NEXT lesson only. */

type DoneDB = ListDB;

export function isDone(u: KtUser, slug: string, idx: number): boolean {
  return mem.done[userKeyOf(u)]?.[slug]?.includes(idx) ?? false;
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
  // Ended playback completes outright (seek-to-end included, by decision):
  // burned-out views must never trap a student with no path forward.
  ended = false,
): boolean {
  if (!ended && !watchRequirementMet(u, slug, idx, watchedSecs, durationSecs, nominalMins)) return false;
  setDoneFlag(u, slug, idx);
  void pushDoneToCloud(slug, idx, watchedSecs, durationSecs, ended).catch(() => {
    /* offline — local flag stays */
  });
  return true;
}

/** Testing helper: wipe this user's views + completions so the watch flow can be retested. */
export function resetProgress(u: KtUser): void {
  const uk = userKeyOf(u);
  const db = mem.views;
  delete db[uk];
  persist(VIEWS_KEY, db);
  const done = mem.done;
  delete done[uk];
  persist(DONE_KEY, done);
}

/* Sticky unlock store: once a part opens it stays open — admin restarts
   of OTHER parts must never re-lock it. Mirrored from the server flag. */

export function isUnlockedFlag(u: KtUser, slug: string, idx: number): boolean {
  return mem.unlocked[userKeyOf(u)]?.[slug]?.includes(idx) ?? false;
}

export function setUnlockedFlag(u: KtUser, slug: string, idx: number): void {
  const db = mem.unlocked;
  const uk = userKeyOf(u);
  const list = db[uk]?.[slug] ?? [];
  if (list.includes(idx)) return;
  mem.unlocked = { ...db, [uk]: { ...(db[uk] ?? {}), [slug]: [...list, idx] } };
  persist(UNLOCK_KEY, mem.unlocked);
}

/* Sequential unlocking: lesson N opens once lesson N-1 STARTED (owner rule —
   at least one playback of N-1 began) — OR is DONE (older completions) — OR
   it was unlocked before (sticky: survives restarts of other parts). Burned
   views never unlock. */
export function isUnlocked(u: KtUser, slug: string, idx: number): boolean {
  if (idx <= 0) return true;
  if (isUnlockedFlag(u, slug, idx)) return true;
  return isDone(u, slug, idx - 1);
}

/* Owner rule (2026-10-17): starting part N's playback opens part N+1.
   Called from the first onProgress heartbeat of a running video; sticky
   flag so it survives restarts. The server get_watch_state mirrors the
   same OR via migration 20261041 (prev-started counts). */
export function unlockNextOnStart(u: KtUser, slug: string, idx: number): void {
  setUnlockedFlag(u, slug, idx);
  setUnlockedFlag(u, slug, idx + 1);
}
