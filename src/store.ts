import { useSyncExternalStore } from "react";
import { STR, type Lang } from "./i18n";
import { COURSE_DETAIL_PHOTOS, COURSE_PHOTOS } from "./course-media";
import { VIDEO_MINS, VIDEO_RES, VIDEO_SOURCES } from "./watch";

/* Single localStorage-backed content store shared by the public
   pages AND the admin dashboard (same browser only — no sync).
   Seeded once from the built-in catalogue, then the store is the
   source of truth for every course/services read. */

export type LText = { en: string; ar: string };
export type Module = { t: string; d: string };

export type StoreVideo = {
  src: string;
  mins: number;
  /** assignment link: URL, uploaded file (data:), or "" = none */
  assign: string;
  /** exam link: URL, uploaded file (data:), or "" = none */
  exam: string;
};

export type Post = {
  title: string;
  text: string;
  image: string;
  link: string;
};

export type StoreCourse = {
  slug: string;
  cat: string;
  bac: boolean;
  cta: LText;
  name: LText;
  designation: LText;
  quote: LText;
  duration: LText;
  lessons: LText;
  schedule: LText;
  level: LText;
  seats: LText;
  seatsN: number;
  /** null = "contact for pricing" */
  price: LText | null;
  photoCard: string;
  photoDetail: string;
  instructor: { name: LText; spec: LText; bio: LText };
  outcomes: { en: string[]; ar: string[] };
  modules: { en: Module[]; ar: Module[] };
  /** Section headers per module index ("Month 1", units…). Empty = ungrouped. */
  sections: { en: string[]; ar: string[] };
  videos: StoreVideo[];
};

export type StoreService = {
  title: LText;
  desc: LText;
  items: { en: string[]; ar: string[] };
  gets: { en: string[]; ar: string[] };
  posts: { en: Post[]; ar: Post[] };
};

export type ContentStore = {
  v: number;
  courses: StoreCourse[];
  services: {
    marketing: StoreService;
    software: StoreService;
    design: StoreService;
    process: { en: Module[]; ar: Module[] };
  };
};

const KEY = "kt-content-v1";

/* ---------------- persistence + reactivity ---------------- */

let cache: ContentStore | null = null;
let version = 0;
const listeners = new Set<() => void>();

let lastStoreError = "";

export function getLastStoreError(): string {
  return lastStoreError;
}

/* Security: gated video/attachment URLs (unlisted YouTube, exam links) must
   never sit in plain localStorage where DevTools can exfiltrate them.
   Memory keeps full URLs for the session; disk keeps only bundled/relative
   assets. Cloud rehydrate restores gated URLs for entitled users. */
function isGatedUrl(u: string): boolean {
  return /^(https?:|data:)/i.test(u.trim());
}

function toPersistable(s: ContentStore | null): ContentStore | null {
  if (!s) return null;
  return {
    ...s,
    courses: s.courses.map((c) => ({
      ...c,
      videos: c.videos.map((v) => ({
        ...v,
        src: isGatedUrl(v.src) ? "" : v.src,
        assign: isGatedUrl(v.assign) ? "" : v.assign,
        exam: isGatedUrl(v.exam) ? "" : v.exam,
      })),
    })),
  };
}

function persist(): boolean {
  try {
    const text = JSON.stringify(toPersistable(cache));
    window.localStorage.setItem(KEY, text);
    lastStoreError = "";
    return true;
  } catch (e) {
    lastStoreError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return false;
  }
}

function seed(): ContentStore {
  const en = STR.en;
  const ar = STR.ar;
  const slugs = ["python-data", "robotics", "solidworks"];
  const courses: StoreCourse[] = slugs.map((slug, i) => {
    const e = en.academy.courses[i];
    const a = ar.academy.courses[i];
    const n = e.modules.length;
    const videos: StoreVideo[] = Array.from({ length: n }, (_, k) => ({
      src: VIDEO_SOURCES[slug]?.[k] ?? "",
      mins: VIDEO_MINS[k] ?? 10,
      assign: (VIDEO_RES[slug]?.[k] ?? []).includes("assign") ? "#/dashboard/assignments" : "",
      exam: (VIDEO_RES[slug]?.[k] ?? []).includes("exam") ? "#/dashboard/exams" : "",
    }));
    return {
      slug,
      cat: e.cat,
      bac: e.bac,
      cta: { en: en.academy.ctas[i] ?? "Buy Now", ar: ar.academy.ctas[i] ?? "اشتري الآن" },
      name: { en: e.name, ar: a.name },
      designation: { en: e.designation, ar: a.designation },
      quote: { en: e.quote, ar: a.quote },
      duration: { en: e.duration, ar: a.duration },
      lessons: { en: e.lessons, ar: a.lessons },
      schedule: { en: e.schedule, ar: a.schedule },
      level: { en: e.level, ar: a.level },
      seats: { en: e.seats, ar: a.seats },
      seatsN: e.seatsN,
      price: null,
      photoCard: COURSE_PHOTOS[i],
      photoDetail: COURSE_DETAIL_PHOTOS[i],
      instructor: {
        name: { en: e.instructor.name, ar: a.instructor.name },
        spec: { en: e.instructor.spec, ar: a.instructor.spec },
        bio: { en: e.instructor.bio, ar: a.instructor.bio },
      },
      outcomes: { en: [...e.outcomes], ar: [...a.outcomes] },
      modules: {
        en: e.modules.map((m) => ({ t: m.t, d: m.d })),
        ar: a.modules.map((m) => ({ t: m.t, d: m.d })),
      },
      sections: { en: Array(n).fill(""), ar: Array(n).fill("") },
      videos,
    };
  });
  const pick = (
    e: { T: string; D: string; I: string[]; G: string[] },
    a: { T: string; D: string; I: string[]; G: string[] },
  ): StoreService => ({
    title: { en: e.T, ar: a.T },
    desc: { en: e.D, ar: a.D },
    items: { en: [...e.I], ar: [...a.I] },
    gets: { en: [...e.G], ar: [...a.G] },
    posts: { en: [], ar: [] },
  });
  return {
    v: 3,
    courses,
    services: {
      marketing: pick(
        { T: en.services.mktT, D: en.services.mktD, I: en.services.mktI, G: en.services.mktG },
        { T: ar.services.mktT, D: ar.services.mktD, I: ar.services.mktI, G: ar.services.mktG },
      ),
      software: pick(
        { T: en.services.softT, D: en.services.softD, I: en.services.softI, G: en.services.softG },
        { T: ar.services.softT, D: ar.services.softD, I: ar.services.softI, G: ar.services.softG },
      ),
      design: pick(
        { T: en.services.desT, D: en.services.desD, I: en.services.desI, G: en.services.desG },
        { T: ar.services.desT, D: ar.services.desD, I: ar.services.desI, G: ar.services.desG },
      ),
      process: {
        en: en.services.process.map((p) => ({ t: p.t, d: p.d })),
        ar: ar.services.process.map((p) => ({ t: p.t, d: p.d })),
      },
    },
  };
}

/** v2 → v3: rename of the bundled sample video rewrites stale saved srcs.
    Narrow exact-filename match only — never touch admin-pasted URLs that
    merely share a host prefix. */
const OLD_SAMPLE = "assets/2026-08-05%2002-46-32.mp4";
const OLD_GTV_SAMPLES = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
];
const NEW_SAMPLE = "assets/vid.mp4";
function healVideoSrc(courses: StoreCourse[]): boolean {
  let fixed = false;
  for (const c of courses) {
    for (const v of c.videos) {
      if (v.src === OLD_SAMPLE || OLD_GTV_SAMPLES.includes(v.src)) {
        v.src = NEW_SAMPLE;
        fixed = true;
      }
    }
  }
  return fixed;
}

/* Supabase is source of truth when configured: local cache seeds instantly,
   then hydrateStoreFromDb() replaces it in the background and notifies. */
let cloudKick = false;
function kickCloudHydrate(): void {
  if (cloudKick || typeof window === "undefined") return;
  cloudKick = true;
  void import("./lib/db/sync")
    .then((m) => m.hydrateStoreFromDb())
    .catch(() => {
      /* offline — seeds stay */
    });
}

/** Replace the whole cache (cloud hydrate). Persists + notifies like commit. */
export function replaceStore(next: ContentStore): void {
  cache = next;
  commit();
}

export function loadStore(): ContentStore {
  if (!cache) {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ContentStore;
        if (parsed && (parsed.v === 2 || parsed.v === 3) && Array.isArray(parsed.courses)) {
          // heal runs on EVERY load: any stale sample URL becomes the bundled video
          parsed.v = 3;
          healVideoSrc(parsed.courses);
          cache = normalizeStore(parsed);
          persist();
        } else if (parsed && (parsed as unknown as { v: number }).v === 1 && Array.isArray(parsed.courses)) {
          cache = normalizeStore(migrateV1(parsed as unknown as V1Store));
          persist();
        }
      }
    } catch {
      /* fall through to seed */
    }
    if (!cache) {
      cache = normalizeStore(seed());
      persist();
    }
  }
  kickCloudHydrate();
  return cache;
}

type V1Video = { src: string; mins: number; res: string[] };
type V1Store = { courses: Array<Omit<StoreCourse, "videos"> & { videos: V1Video[] }>; services: Record<string, Record<string, unknown>> };

/** v1 → v2: res flags become real link slots; services gain posts. */
function migrateV1(old: V1Store): ContentStore {
  const fresh = seed();
  const bySlug = new Map(fresh.courses.map((c) => [c.slug, c]));
  for (const oc of old.courses) {
    const base = bySlug.get(oc.slug);
    const videos: StoreVideo[] = oc.videos.map((v) => ({
      src: v.src,
      mins: v.mins,
      assign: v.res.includes("assign") ? "#/dashboard/assignments" : "",
      exam: v.res.includes("exam") ? "#/dashboard/exams" : "",
    }));
    if (base) {
      // built-in edited in v1: keep admin's content, adopt v2 video shape
      const merged: StoreCourse = { ...(oc as unknown as StoreCourse), videos };
      const i = fresh.courses.findIndex((c) => c.slug === oc.slug);
      fresh.courses[i] = merged;
    } else {
      // custom v1 course: carry over, drop unknown extras
      const { videos: _drop, ...rest } = oc as unknown as StoreCourse & { videos: V1Video[] };
      void _drop;
      fresh.courses.push({ ...rest, videos });
    }
  }
  healVideoSrc(fresh.courses);
  return fresh;
}

function commit(): boolean {
  const ok = persist();
  version += 1;
  listeners.forEach((fn) => fn());
  return ok;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getStoreVersion(): number {
  return version;
}

export { subscribe };

/** Re-render hook — call in any component reading the store. */
export function useContent(): number {
  return useSyncExternalStore(subscribe, getStoreVersion);
}

let syncWired = false;
/** Cross-tab + same-tab-outside-React updates invalidate the cache. */
export function wireStoreSync(): void {
  if (syncWired || typeof window === "undefined") return;
  syncWired = true;
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
      version += 1;
      listeners.forEach((fn) => fn());
    }
  });
}

/* ---------------- reads (public pages use these) ---------------- */

/** ISO dates (from the admin date picker) render localized; free text passes through. */
export function formatSchedule(value: string, lang: Lang): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    try {
      const d = new Date(`${value.trim()}T12:00:00`);
      return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return value;
    }
  }
  return value;
}
/** Old cats (prog/robot/cad) normalize into the new taxonomy. */
function normCat(cat: string): string {
  if (cat === "tech" || cat === "other") return cat;
  if (cat === "cad") return "other";
  return "tech";
}

export type CourseView = {
  slug: string;
  cat: string;
  bac: boolean;
  cta: string;
  name: string;
  designation: string;
  quote: string;
  duration: string;
  lessons: string;
  schedule: string;
  level: string;
  seats: string;
  seatsN: number;
  price: string | null;
  photoCard: string;
  photoDetail: string;
  instructor: { name: string; spec: string; bio: string };
  outcomes: string[];
  modules: Module[];
  /** Section header per module index (same order as modules). "" = ungrouped. */
  sections: string[];
};

/** Legacy caches predate sections — normalize once per load, never crash. */
function sectionsOf(c: StoreCourse, side: Lang): string[] {
  const raw = (c as unknown as { sections?: { en?: unknown; ar?: unknown } }).sections;
  const list = raw?.[side];
  return Array.isArray(list) ? (list as unknown[]).map((s) => (typeof s === "string" ? s : "")) : [];
}

function normalizeStore(s: ContentStore): ContentStore {
  for (const c of s.courses) {
    const cAny = c as unknown as { sections?: unknown };
    if (!cAny.sections || typeof cAny.sections !== "object") {
      cAny.sections = { en: [], ar: [] };
    }
  }
  return s;
}

export function listCourses(lang: Lang): CourseView[] {
  return loadStore().courses.map((c) => viewCourse(c, lang));
}

export function viewCourse(c: StoreCourse, lang: Lang): CourseView {
  const other: Lang = lang === "ar" ? "en" : "ar";
  // new courses are often filled in one language only — fall back instead of blank
  const pick = (t: LText): string => t[lang].trim() || t[other].trim();
  const pickList = (t: { en: string[]; ar: string[] }): string[] => {
    const v = t[lang].filter((s) => s.trim());
    return v.length ? v : t[other].filter((s) => s.trim());
  };
  const pickMods = (): { mods: Module[]; sections: string[] } => {
    const pickSide = (side: Lang) =>
      c.modules[side]
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.t.trim() || m.d.trim());
    let picked = pickSide(lang);
    let side: Lang = lang;
    if (picked.length === 0) {
      picked = pickSide(other);
      side = other;
    }
    const secs = sectionsOf(c, side);
    const fallback = side === lang ? sectionsOf(c, other) : [];
    return {
      mods: picked.map(({ m }) => ({ t: m.t, d: m.d })),
      sections: picked.map(({ i }) => (secs[i] ?? fallback[i] ?? "").trim()),
    };
  };
  const picked = pickMods();
  return {
    slug: c.slug,
    cat: normCat(c.cat),
    bac: c.bac,
    cta: pick(c.cta),
    name: pick(c.name),
    designation: pick(c.designation),
    quote: pick(c.quote),
    duration: pick(c.duration),
    lessons: pick(c.lessons),
    schedule: formatSchedule(pick(c.schedule), lang),
    level: pick(c.level),
    seats: pick(c.seats),
    seatsN: c.seatsN,
    price: c.price ? pick(c.price) || null : null,
    photoCard: c.photoCard,
    photoDetail: c.photoDetail,
    instructor: {
      name: pick(c.instructor.name),
      spec: pick(c.instructor.spec),
      bio: pick(c.instructor.bio),
    },
    outcomes: pickList(c.outcomes),
    modules: picked.mods,
    sections: picked.sections,
  };
}

export function getCourse(lang: Lang, slug: string): CourseView | null {
  const raw = loadStore().courses.find((c) => c.slug === slug);
  return raw ? viewCourse(raw, lang) : null;
}

export function courseExists(slug: string): boolean {
  return loadStore().courses.some((c) => c.slug === slug);
}

export type VideoView = { src: string; mins: number; assign: string; exam: string };

export function getVideos(slug: string): VideoView[] {
  const raw = loadStore().courses.find((c) => c.slug === slug);
  return (raw?.videos ?? []).map((v) => ({ src: v.src, mins: v.mins, assign: v.assign ?? "", exam: v.exam ?? "" }));
}

export type ServiceView = {
  title: string;
  desc: string;
  items: string[];
  gets: string[];
};

export function getService(
  lang: Lang,
  slug: "marketing" | "software" | "design",
): ServiceView {
  const s = loadStore().services[slug];
  return {
    title: s.title[lang],
    desc: s.desc[lang],
    items: [...s.items[lang]],
    gets: [...s.gets[lang]],
  };
}

export function getProcess(lang: Lang): Module[] {
  return loadStore().services.process[lang].map((p) => ({ t: p.t, d: p.d }));
}

export function getPosts(lang: Lang, slug: "marketing" | "software" | "design"): Post[] {
  return loadStore().services[slug].posts[lang].map((p) => ({ ...p }));
}

/* ---------------- writes (admin) ---------------- */

/** Best-effort cloud write-through (requires Supabase admin session; local always wins for UI). */
function pushToCloud(fn: (m: typeof import("./lib/db/sync")) => Promise<unknown>): void {
  if (typeof window === "undefined") return;
  void import("./lib/db/sync")
    .then((m) => fn(m))
    .catch(() => {
      /* RLS/offline — local change stays */
    });
}

export function saveCourse(course: StoreCourse, skipCloud = false): boolean {
  const s = loadStore();
  const i = s.courses.findIndex((c) => c.slug === course.slug);
  if (i >= 0) s.courses[i] = course;
  else s.courses.push(course);
  const ok = commit();
  if (!skipCloud) pushToCloud((m) => m.pushCourseToDb(course));
  return ok;
}

/** Awaitable cloud push for admin saves: true = synced, false = local-only
    (offline / RLS denial). Lets the UI say plainly which one happened. */
export async function pushCourseNow(course: StoreCourse): Promise<boolean> {
  try {
    const m = await import("./lib/db/sync");
    return await m.pushCourseToDb(course);
  } catch {
    return false;
  }
}

export function deleteCourse(slug: string): void {
  const s = loadStore();
  s.courses = s.courses.filter((c) => c.slug !== slug);
  commit();
  pushToCloud((m) => m.pushDeleteCourseToDb(slug));
}

export function getRawCourse(slug: string): StoreCourse | null {
  const raw = loadStore().courses.find((c) => c.slug === slug);
  return raw ? JSON.parse(JSON.stringify(raw)) : null;
}

export function saveService(
  slug: "marketing" | "software" | "design",
  svc: StoreService,
): void {
  loadStore().services[slug] = svc;
  commit();
  pushToCloud((m) => m.pushServiceToDb(slug, svc));
}

export function saveProcess(process: { en: Module[]; ar: Module[] }): void {
  loadStore().services.process = process;
  commit();
  pushToCloud((m) => m.pushProcessToDb(process));
}

export function resetStore(): void {
  cache = seed();
  commit();
}

/** Restore the built-in courses, keep services edits.
   Cloud-aware: re-pushes seeds (id-preserving, student progress intact) and
   deletes custom courses remotely too — otherwise the next hydrate would
   resurrect everything just "deleted". */
export function resetCourses(): void {
  const s = loadStore();
  const fresh = seed().courses;
  const keep = new Set(fresh.map((c) => c.slug));
  const doomed = s.courses.map((c) => c.slug).filter((slug) => !keep.has(slug));
  s.courses = fresh;
  commit();
  pushToCloud(async (m) => {
    for (const c of fresh) {
      try {
        await m.pushCourseToDb(c);
      } catch {
        /* keep going */
      }
    }
    for (const slug of doomed) {
      try {
        await m.pushDeleteCourseToDb(slug);
      } catch {
        /* keep going */
      }
    }
  });
}

/* Admin auth is Supabase-only (verified profiles.role via adminGuard).
   The legacy localStorage flag + hardcoded credentials were removed —
   client-side flags are forgeable and must never gate protected routes. */
