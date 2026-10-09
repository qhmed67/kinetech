import { supabase } from "./client";
import { replaceStore, type ContentStore, type StoreCourse, type StoreService } from "../../store";
import { getUser, setUser, notifyUserChanged } from "../../auth";
import { purgeProgress, setViewsCount, setDoneFlag } from "../../watch";
import { NETWORK_TIMEOUT_MS, withTimeout } from "./throttle";
import { toDirectImageUrl } from "../drive";
import { getWatchStateDb, recordPlayDb, completeVideoDb } from "./watchDb";

/* Cloud sync: Supabase is source of truth when configured.
   Local cache stays for instant sync UI + offline fallback.
   Every function is best-effort — failures keep local behavior. */

const videoIds = new Map<string, string>();
const vk = (slug: string, idx: number) => `${slug}:${idx}`;

/* Abuse guards: dedupe parallel hydrates, cooldown refetches, serialize
   bootstrap, coalesce rapid play pushes. Prevents sync spam on remounts,
   tab switches, and click storms. */
let hydrateInflight: Promise<boolean> | null = null;
let lastHydrate = 0;
const HYDRATE_COOLDOWN_MS = 30_000;
let hydrateSeq = 0;
let hydrateCtl: AbortController | null = null;
let bootstrapRunning = false;
const playInflight = new Set<string>();
const playQueued = new Set<string>();

/** Logout/state purge: drops id caches, cancels stale hydrates, resets guards. */
export function clearCloudCache(): void {
  videoIds.clear();
  hydrateInflight = null;
  lastHydrate = 0;
  bootstrapRunning = false;
  playInflight.clear();
  playQueued.clear();
  try {
    hydrateCtl?.abort();
  } catch {
    /* ignore */
  }
  hydrateCtl = null;
}

function sig<T>(q: T, signal: AbortSignal | undefined): T {
  if (signal) {
    const withAbort = q as unknown as { abortSignal?: (s: AbortSignal) => unknown };
    if (typeof withAbort.abortSignal === "function") withAbort.abortSignal(signal);
  }
  return q;
}

function dbCat(cat: string): "tech" | "other" {
  if (cat === "other") return "other";
  return "tech";
}

/* ---------------- hydrate: DB -> local cache ---------------- */

type DbCourseRow = {
  id: string; slug: string; cat: string; is_bac: boolean; seats_n: number;
  price_cents: number | null; photo_card_url: string | null; photo_detail_url: string | null;
  instructors: {
    name_en: string; name_ar: string; spec_en: string | null; spec_ar: string | null;
    bio_en: string | null; bio_ar: string | null;
  } | null;
  course_translations: Array<{
    lang: string; name: string; designation: string | null; quote: string | null;
    duration: string | null; lessons: string | null; schedule: string | null; level: string | null;
    seats_label: string | null; cta_label: string | null; outcomes: string[] | null;
  }>;
};

function priceText(cents: number | null, lang: "en" | "ar"): string | null {
  if (cents == null) return null;
  const v = (cents / 100).toString();
  return lang === "ar" ? `${v} ج.م` : `EGP ${v}`;
}

/** Pull full catalog (both langs) + services + process + bac. Replaces local cache only if DB has courses. */
export async function hydrateStoreFromDb(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!opts.force) {
    if (hydrateInflight) return hydrateInflight;
    if (Date.now() - lastHydrate < HYDRATE_COOLDOWN_MS) return false;
  }
  hydrateCtl?.abort();
  hydrateCtl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = hydrateCtl?.signal;
  const mySeq = ++hydrateSeq;
  const run = (async (): Promise<boolean> => {
    const sb = supabase();
    if (!sb) return false;
    const [{ data: courses }, { data: mods }, { data: vids }] = await Promise.all([
      sig(sb.from("courses").select(
        "id,slug,cat,is_bac,seats_n,price_cents,photo_card_url,photo_detail_url," +
          "instructors(name_en,name_ar,spec_en,spec_ar,bio_en,bio_ar)," +
          "course_translations(lang,name,designation,quote,duration,lessons,schedule,level,seats_label,cta_label,outcomes)",
      ), signal),
      sig(sb.from("modules").select("id,course_id,sort_order,module_translations(lang,title,description)").order("sort_order"), signal),
      sig(sb.from("videos").select("id,course_id,module_id,sort_order,src_url,mins,assign_url,exam_url").order("sort_order"), signal),
    ]);
    if (mySeq !== hydrateSeq) return false; // superseded — discard stale response
    lastHydrate = Date.now();
  const rows = (courses ?? []) as unknown as DbCourseRow[];
  if (rows.length === 0) return false; // DB not seeded yet — keep local seeds

  const modRows = (mods ?? []) as unknown as Array<{
    id: string; course_id: string; sort_order: number;
    module_translations: Array<{ lang: string; title: string; description: string | null }>;
  }>;
  const vidRows = (vids ?? []) as unknown as Array<{
    id: string; course_id: string; sort_order: number;
    src_url: string; mins: number; assign_url: string | null; exam_url: string | null;
  }>;
  videoIds.clear();
  const modsByCourse = new Map<string, typeof modRows>();
  for (const m of modRows) {
    const l = modsByCourse.get(m.course_id) ?? [];
    l.push(m);
    modsByCourse.set(m.course_id, l);
  }
  const vidsByCourse = new Map<string, typeof vidRows>();
  for (const v of vidRows) {
    const l = vidsByCourse.get(v.course_id) ?? [];
    l.push(v);
    vidsByCourse.set(v.course_id, l);
  }

  const tr = (list: DbCourseRow["course_translations"], lang: string) =>
    list.find((t) => t.lang === lang);
  const pickTr = (c: DbCourseRow, lang: "en" | "ar", key: "name" | "designation" | "quote" | "duration" | "lessons" | "schedule" | "level" | "seats_label" | "cta_label"): string => {
    const v = tr(c.course_translations, lang)?.[key] ?? "";
    if (v.trim()) return v;
    const other = lang === "ar" ? "en" : "ar";
    return tr(c.course_translations, other)?.[key] ?? "";
  };

  const storeCourses: StoreCourse[] = rows.map((c) => {
    const cMods = modsByCourse.get(c.id) ?? [];
    const cVids = vidsByCourse.get(c.id) ?? [];
    const vidByOrder = new Map(cVids.map((v) => [v.sort_order, v]));
    const byLang = (lang: "en" | "ar") => cMods.map((m) => {
    const t = m.module_translations.find((x) => x.lang === lang)
      ?? m.module_translations.find((x) => x.title?.trim());
    return { t: t?.title ?? "", d: t?.description ?? "" };
  });
    const videos = cMods.map((m, i) => {
      const v = vidByOrder.get(m.sort_order) ?? cVids[i];
      if (v) videoIds.set(vk(c.slug, i), v.id);
      return {
        src: v?.src_url ?? "",
        mins: v?.mins ?? 10,
        assign: v?.assign_url ?? "",
        exam: v?.exam_url ?? "",
      };
    });
    const ins = c.instructors;
    return {
      slug: c.slug,
      cat: dbCat(c.cat),
      bac: c.is_bac,
      cta: { en: pickTr(c, "en", "cta_label"), ar: pickTr(c, "ar", "cta_label") },
      name: { en: pickTr(c, "en", "name"), ar: pickTr(c, "ar", "name") },
      designation: { en: pickTr(c, "en", "designation"), ar: pickTr(c, "ar", "designation") },
      quote: { en: pickTr(c, "en", "quote"), ar: pickTr(c, "ar", "quote") },
      duration: { en: pickTr(c, "en", "duration"), ar: pickTr(c, "ar", "duration") },
      lessons: { en: pickTr(c, "en", "lessons"), ar: pickTr(c, "ar", "lessons") },
      schedule: { en: pickTr(c, "en", "schedule"), ar: pickTr(c, "ar", "schedule") },
      level: { en: pickTr(c, "en", "level"), ar: pickTr(c, "ar", "level") },
      seats: { en: pickTr(c, "en", "seats_label"), ar: pickTr(c, "ar", "seats_label") },
      seatsN: c.seats_n,
      price: c.price_cents == null
        ? null
        : { en: priceText(c.price_cents, "en") ?? "", ar: priceText(c.price_cents, "ar") ?? "" },
      photoCard: c.photo_card_url ?? "",
      // Detail falls back to card: older rows predate the detail-image field.
      photoDetail: c.photo_detail_url ?? c.photo_card_url ?? "",
      instructor: {
        name: { en: ins?.name_en ?? "", ar: ins?.name_ar ?? "" },
        spec: { en: ins?.spec_en ?? "", ar: ins?.spec_ar ?? "" },
        bio: { en: ins?.bio_en ?? "", ar: ins?.bio_ar ?? "" },
      },
      outcomes: {
        en: tr(c.course_translations, "en")?.outcomes ?? tr(c.course_translations, "ar")?.outcomes ?? [],
        ar: tr(c.course_translations, "ar")?.outcomes ?? tr(c.course_translations, "en")?.outcomes ?? [],
      },
      modules: { en: byLang("en"), ar: byLang("ar") },
      videos,
    };
  });

  // services + posts + process (best-effort, keep local on failure)
  let servicesPatch: ContentStore["services"] | null = null;
  try {
    const [{ data: svcTr }, { data: posts }, { data: steps }] = await Promise.all([
      sig(sb.from("service_translations").select("service_slug,lang,title,description,items,gets"), signal),
      sig(sb.from("service_posts").select("service_slug,lang,title,body,image_url,link,sort_order").order("sort_order"), signal),
      sig(sb.from("process_steps").select("sort_order,title_en,title_ar,desc_en,desc_ar").order("sort_order"), signal),
    ]);
    if (mySeq !== hydrateSeq) return false; // superseded — discard stale response
    const trRows = (svcTr ?? []) as unknown as Array<{
      service_slug: string; lang: string; title: string; description: string | null;
      items: string[]; gets: string[];
    }>;
    const postRows = (posts ?? []) as unknown as Array<{
      service_slug: string; lang: string; title: string | null; body: string | null;
      image_url: string | null; link: string | null;
    }>;
    const stepRows = (steps ?? []) as unknown as Array<{
      title_en: string | null; title_ar: string | null; desc_en: string | null; desc_ar: string | null;
    }>;
    if (trRows.length > 0) {
      const one = (slug: string, lang: "en" | "ar") => trRows.find((r) => r.service_slug === slug && r.lang === lang);
      const build = (slug: "marketing" | "software" | "design"): StoreService => {
        const e = one(slug, "en");
        const a = one(slug, "ar");
        return {
          title: { en: e?.title ?? "", ar: a?.title ?? e?.title ?? "" },
          desc: { en: e?.description ?? "", ar: a?.description ?? e?.description ?? "" },
          items: { en: e?.items ?? [], ar: a?.items ?? e?.items ?? [] },
          gets: { en: e?.gets ?? [], ar: a?.gets ?? e?.gets ?? [] },
          posts: {
            en: postRows.filter((p) => p.service_slug === slug && p.lang === "en")
              .map((p) => ({ title: p.title ?? "", text: p.body ?? "", image: p.image_url ?? "", link: p.link ?? "" })),
            ar: postRows.filter((p) => p.service_slug === slug && p.lang === "ar")
              .map((p) => ({ title: p.title ?? "", text: p.body ?? "", image: p.image_url ?? "", link: p.link ?? "" })),
          },
        };
      };
      servicesPatch = {
        marketing: build("marketing"),
        software: build("software"),
        design: build("design"),
        process: stepRows.length > 0
          ? {
              en: stepRows.map((s) => ({ t: s.title_en ?? "", d: s.desc_en ?? "" })),
              ar: stepRows.map((s) => ({ t: s.title_ar ?? s.title_en ?? "", d: s.desc_ar ?? s.desc_en ?? "" })),
            }
          : { en: [], ar: [] },
      };
    }
  } catch {
    /* keep local services */
  }

    if (mySeq !== hydrateSeq) return false; // superseded — discard stale response
    const { loadStore } = await import("../../store");
    const local = loadStore();
    replaceStore({
      v: 3,
      courses: storeCourses,
      services: servicesPatch ?? local.services,
    });
    return true;
  })();
  if (!opts.force) {
    hydrateInflight = run;
    try {
      return await run;
    } finally {
      if (hydrateInflight === run) hydrateInflight = null;
    }
  }
  return run;
}

/* ---------------- watch progress: DB -> local ---------------- */

/** Pull server-side views/done for enrolled slugs into local keys (server wins). */
export async function hydrateWatchForUser(): Promise<void> {
  const sb = supabase();
  const user = getUser();
  if (!sb || !user) return;
  // Hydrate granted courses (server still enforces sign-in + 3-view cap).
  let slugs: string[];
  try {
    const { loadStore } = await import("../../store");
    slugs = loadStore().courses.map((c) => c.slug);
  } catch {
    return;
  }
  const granted = new Set(user.enrolled ?? []);
  for (const slug of slugs.filter((s) => granted.has(s))) {
    try {
      const rows = await withTimeout(getWatchStateDb(slug, "en"), NETWORK_TIMEOUT_MS, "watch-state");
      for (const r of rows) {
        videoIds.set(vk(slug, r.sort_order), r.video_id);
        setViewsCount(user, slug, r.sort_order, Math.min(3, Math.max(0, r.views_count)));
        if (r.done) setDoneFlag(user, slug, r.sort_order);
      }
    } catch {
      /* signed out / offline — local stays */
    }
  }
}

async function resolveVideoId(slug: string, idx: number): Promise<string | null> {
  const hit = videoIds.get(vk(slug, idx));
  if (hit) return hit;
  const sb = supabase();
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

/**
 * Fire-and-forget server count (local already updated for instant UI).
 * Rapid repeats coalesce: concurrent push runs trailing-edge so no play is
 * ever dropped (dropping would under-count server-side and grant free views).
 */
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
): Promise<void> {
  try {
    const id = await resolveVideoId(slug, idx);
    if (id) await completeVideoDb(id, watchedSecs, durationSecs);
  } catch {
    /* offline / requirement unmet — local decides UI, server decides truth */
  }
}

/* ---------------- session: DB -> local ---------------- */

export async function restoreDbSession(): Promise<boolean> {
  const sb = supabase();
  if (!sb) return false;
  try {
    const { data } = await withTimeout(sb.auth.getSession(), NETWORK_TIMEOUT_MS, "session");
    const uid = data.session?.user.id;
    if (!uid) return false;
    const { loadSessionUser } = await import("./authDb");
    let s;
    try {
      s = await loadSessionUser(uid);
    } catch (ex) {
      // Profile row gone (admin-deleted) but the auth account survives:
      // kill the whole session so the orphan can never linger signed in.
      if (ex instanceof Error && ex.message === "profile missing") {
        const { signOutEverywhere } = await import("../../auth");
        await signOutEverywhere();
      }
      return false;
    }
    const local = getUser();
    setUser({
      name: s.name || local?.name || "Student",
      email: s.email,
      phone: s.phone || local?.phone || "",
      // Admin-granted slugs win; banned wins over everything.
      enrolled: [...s.enrolled],
      tracks: s.tracks.length > 0 ? [...s.tracks] : (local?.tracks ?? ["courses"]),
      role: s.role,
      banned: s.banned,
    });
    notifyUserChanged();
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-adopt server grants mid-session (revoked courses vanish) and purge
 * local progress traces of anything no longer granted — a removed course
 * must not keep showing its old bar.
 */
export async function syncMyGrants(): Promise<boolean> {
  const before = getUser();
  const beforeSet = new Set(before?.enrolled ?? []);
  let changed = false;
  try {
    changed = await restoreDbSession();
  } catch {
    return false;
  }
  const after = getUser();
  if (after) {
    const now = new Set(after.enrolled ?? []);
    for (const slug of beforeSet) {
      if (!now.has(slug)) purgeProgress(after, slug);
    }
  }
  return changed;
}

/** Persist a newly activated dashboard space server-side (owner-only RLS). */
export async function addTrackToCloud(track: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  try {
    const { data } = await withTimeout(sb.auth.getSession(), NETWORK_TIMEOUT_MS, "session");
    const uid = data.session?.user.id;
    if (!uid) return;
    await sb.from("user_tracks").upsert(
      { user_id: uid, track },
      { onConflict: "user_id,track" },
    );
  } catch {
    /* offline — local space stays, syncs on next bootstrap if track persists */
  }
}

/** One call for App mount: catalog, session, watch progress.
   Never rejects; never leaves the guard set; onUser errors can't break it. */
export async function bootstrapFromCloud(onUser: () => void): Promise<void> {
  if (bootstrapRunning) return;
  bootstrapRunning = true;
  const safeUser = () => {
    try {
      onUser();
    } catch {
      /* UI callback must not break sync */
    }
  };
  try {
    try {
      await hydrateStoreFromDb();
    } catch {
      /* offline — seeds stay */
    }
    try {
      if (await restoreDbSession()) safeUser();
    } catch {
      /* keep local session */
    }
    try {
      await hydrateWatchForUser();
    } catch {
      /* local progress stays */
    }
  } finally {
    bootstrapRunning = false;
  }
}

/* ---------------- admin write-through: local -> DB ---------------- */

function parsePriceCents(price: { en: string; ar: string } | null): number | null {
  if (!price) return null;
  const raw = `${price.en} ${price.ar}`.replace(/[^0-9.]/g, " ").trim().split(/\s+/)[0];
  const v = parseFloat(raw ?? "");
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export async function pushCourseToDb(course: StoreCourse): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const insEn = course.instructor.name.en.trim();
  let instructorId: string | null = null;
  if (insEn) {
    const { data: found } = await sb.from("instructors").select("id").eq("name_en", insEn).limit(1);
    const f = ((found ?? []) as unknown as Array<{ id: string }>)[0];
    if (f) {
      instructorId = f.id;
    } else {
      const { data: created } = await sb.from("instructors").insert({
        name_en: insEn,
        name_ar: course.instructor.name.ar || insEn,
        spec_en: course.instructor.spec.en || null,
        spec_ar: course.instructor.spec.ar || null,
        bio_en: course.instructor.bio.en || null,
        bio_ar: course.instructor.bio.ar || null,
      }).select("id").single();
      instructorId = (created as unknown as { id: string } | null)?.id ?? null;
    }
  }
  const { data: c } = await sb.from("courses").upsert({
    slug: course.slug,
    cat: dbCat(course.cat),
    is_bac: course.bac,
    seats_n: course.seatsN,
    price_cents: parsePriceCents(course.price),
    // Normalize Drive share links; drop legacy embedded payloads.
    photo_card_url: toDirectImageUrl(course.photoCard) || null,
    photo_detail_url: toDirectImageUrl(course.photoDetail) || toDirectImageUrl(course.photoCard) || null,
    instructor_id: instructorId,
  }, { onConflict: "slug" }).select("id").single();
  const courseId = (c as unknown as { id: string } | null)?.id;
  if (!courseId) return;
  await sb.from("course_translations").upsert([
    {
      course_id: courseId, lang: "en",
      name: course.name.en, designation: course.designation.en, quote: course.quote.en,
      duration: course.duration.en, lessons: course.lessons.en, schedule: course.schedule.en,
      level: course.level.en, seats_label: course.seats.en, cta_label: course.cta.en,
      outcomes: course.outcomes.en,
    },
    {
      course_id: courseId, lang: "ar",
      name: course.name.ar || course.name.en, designation: course.designation.ar,
      quote: course.quote.ar, duration: course.duration.ar, lessons: course.lessons.ar,
      schedule: course.schedule.ar, level: course.level.ar,
      seats_label: course.seats.ar, cta_label: course.cta.ar,
      outcomes: course.outcomes.ar.length > 0 ? course.outcomes.ar : course.outcomes.en,
    },
  ], { onConflict: "course_id,lang" });
  // Id-preserving sync: match existing rows by sort_order so student
  // video_views (keyed by video id) survive admin edits. Only rows past the
  // new length are deleted; that is the sole progress-loss case (removed lesson).
  const { data: existing } = await sb.from("modules")
    .select("id,sort_order,videos(id,sort_order)")
    .eq("course_id", courseId);
  const modRows = ((existing ?? []) as unknown as Array<{
    id: string; sort_order: number; videos: Array<{ id: string; sort_order: number }>;
  }>).sort((a, b) => a.sort_order - b.sort_order);
  const modByOrder = new Map(modRows.map((m) => [m.sort_order, m]));
  const n = Math.max(course.modules.en.length, course.videos.length, 1);
  const keepModIds = new Set<string>();
  for (let i = 0; i < n; i++) {
    let modId = modByOrder.get(i)?.id ?? null;
    if (!modId) {
      const { data: m } = await sb.from("modules")
        .insert({ course_id: courseId, sort_order: i }).select("id").single();
      modId = (m as unknown as { id: string } | null)?.id ?? null;
    }
    if (!modId) continue;
    keepModIds.add(modId);
    await sb.from("module_translations").upsert([
      { module_id: modId, lang: "en", title: course.modules.en[i]?.t ?? "", description: course.modules.en[i]?.d ?? "" },
      { module_id: modId, lang: "ar", title: course.modules.ar[i]?.t ?? course.modules.en[i]?.t ?? "", description: course.modules.ar[i]?.d ?? course.modules.en[i]?.d ?? "" },
    ], { onConflict: "module_id,lang" });
    const v = course.videos[i];
    const existingVid = (modByOrder.get(i)?.videos ?? []).find((x) => x.sort_order === i)?.id
      ?? (await sb.from("videos").select("id").eq("course_id", courseId).eq("sort_order", i).limit(1)
        .then((r) => ((r.data ?? []) as unknown as Array<{ id: string }>)[0]?.id ?? null));
    if (v && (v.src || "").trim()) {
      const row = {
        course_id: courseId, module_id: modId, sort_order: i,
        src_url: v.src, mins: v.mins,
        assign_url: v.assign || null, exam_url: v.exam || null,
      };
      if (existingVid) {
        await sb.from("videos").update(row).eq("id", existingVid);
        videoIds.set(vk(course.slug, i), existingVid);
      } else {
        const { data: vv } = await sb.from("videos").insert(row).select("id").single();
        const vid = (vv as unknown as { id: string } | null)?.id;
        if (vid) videoIds.set(vk(course.slug, i), vid);
      }
    } else if (existingVid) {
      // Lesson dropped its video: remove the row (its views go with it).
      await sb.from("videos").delete().eq("id", existingVid);
      videoIds.delete(vk(course.slug, i));
    }
  }
  for (const m of modRows) {
    if (!keepModIds.has(m.id)) await sb.from("modules").delete().eq("id", m.id);
  }
}

export async function pushDeleteCourseToDb(slug: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.from("courses").delete().eq("slug", slug);
}

/** NOTE: deleting a course cascades its views server-side. */
export async function pushServiceToDb(
  slug: "marketing" | "software" | "design",
  svc: StoreService,
): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.from("service_translations").upsert([
    {
      service_slug: slug, lang: "en",
      title: svc.title.en, description: svc.desc.en, items: svc.items.en, gets: svc.gets.en,
    },
    {
      service_slug: slug, lang: "ar",
      title: svc.title.ar || svc.title.en, description: svc.desc.ar || svc.desc.en,
      items: svc.items.ar.length > 0 ? svc.items.ar : svc.items.en,
      gets: svc.gets.ar.length > 0 ? svc.gets.ar : svc.gets.en,
    },
  ], { onConflict: "service_slug,lang" });
  await sb.from("service_posts").delete().eq("service_slug", slug);
  const rows = (["en", "ar"] as const).flatMap((lang) =>
    svc.posts[lang].map((p, i) => ({
      service_slug: slug, lang, title: p.title, body: p.text,
      image_url: p.image || null, link: p.link || null, sort_order: i,
    })),
  );
  if (rows.length > 0) await sb.from("service_posts").insert(rows);
}

export async function pushProcessToDb(process: { en: { t: string; d: string }[]; ar: { t: string; d: string }[] }): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.from("process_steps").delete().neq("sort_order", -1);
  const n = Math.max(process.en.length, process.ar.length);
  const rows = Array.from({ length: n }, (_, i) => ({
    sort_order: i,
    title_en: process.en[i]?.t ?? "", desc_en: process.en[i]?.d ?? "",
    title_ar: process.ar[i]?.t ?? process.en[i]?.t ?? "",
    desc_ar: process.ar[i]?.d ?? process.en[i]?.d ?? "",
  }));
  if (rows.length > 0) await sb.from("process_steps").insert(rows);
}
