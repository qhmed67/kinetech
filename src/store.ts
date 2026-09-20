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
  v: 2;
  courses: StoreCourse[];
  services: {
    marketing: StoreService;
    software: StoreService;
    design: StoreService;
    process: { en: Module[]; ar: Module[] };
  };
};

const KEY = "kt-content-v1";
const ADMIN_KEY = "kt-admin";

/* ---------------- persistence + reactivity ---------------- */

let cache: ContentStore | null = null;
let version = 0;
const listeners = new Set<() => void>();

let lastStoreError = "";

export function getLastStoreError(): string {
  return lastStoreError;
}

function persist(): boolean {
  try {
    const text = JSON.stringify(cache);
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
    v: 2,
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

export function loadStore(): ContentStore {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ContentStore;
      if (parsed && parsed.v === 2 && Array.isArray(parsed.courses)) {
        cache = parsed;
        return cache;
      }
      if (parsed && (parsed as unknown as { v: number }).v === 1 && Array.isArray(parsed.courses)) {
        cache = migrateV1(parsed as unknown as V1Store);
        persist();
        return cache;
      }
    }
  } catch {
    /* fall through to seed */
  }
  cache = seed();
  persist();
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
};

export function listCourses(lang: Lang): CourseView[] {
  return loadStore().courses.map((c) => viewCourse(c, lang));
}

export function viewCourse(c: StoreCourse, lang: Lang): CourseView {
  return {
    slug: c.slug,
    cat: normCat(c.cat),
    bac: c.bac,
    cta: c.cta[lang],
    name: c.name[lang],
    designation: c.designation[lang],
    quote: c.quote[lang],
    duration: c.duration[lang],
    lessons: c.lessons[lang],
    schedule: c.schedule[lang],
    level: c.level[lang],
    seats: c.seats[lang],
    seatsN: c.seatsN,
    price: c.price ? c.price[lang] : null,
    photoCard: c.photoCard,
    photoDetail: c.photoDetail,
    instructor: {
      name: c.instructor.name[lang],
      spec: c.instructor.spec[lang],
      bio: c.instructor.bio[lang],
    },
    outcomes: [...c.outcomes[lang]],
    modules: c.modules[lang].map((m) => ({ t: m.t, d: m.d })),
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

export function saveCourse(course: StoreCourse): boolean {
  const s = loadStore();
  const i = s.courses.findIndex((c) => c.slug === course.slug);
  if (i >= 0) s.courses[i] = course;
  else s.courses.push(course);
  return commit();
}

export function deleteCourse(slug: string): void {
  const s = loadStore();
  s.courses = s.courses.filter((c) => c.slug !== slug);
  commit();
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
}

export function saveProcess(process: { en: Module[]; ar: Module[] }): void {
  loadStore().services.process = process;
  commit();
}

export function resetStore(): void {
  cache = seed();
  commit();
}

/* ---------------- mock admin auth ---------------- */

export const ADMIN_USER = "admin";
export const ADMIN_PASS = "1234";

export function isAdmin(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function adminLogin(u: string, p: string): boolean {
  if (u.trim() === ADMIN_USER && p === ADMIN_PASS) {
    try {
      window.localStorage.setItem(ADMIN_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

export function adminLogout(): void {
  try {
    window.localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
}
