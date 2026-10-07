import { supabase } from "./client";
import type { Lang } from "../../i18n";

export type CourseCard = {
  slug: string;
  cat: string;
  is_bac: boolean;
  name: string;
  designation: string;
  quote: string;
  duration: string;
  level: string;
  photo_card_url: string | null;
};

/** Lean catalog: translation join filtered by active locale only. */
export async function listCoursesDb(
  lang: Lang,
  opts: { filter?: "all" | "bac" | "tech" | "other"; q?: string; limit?: number } = {},
): Promise<CourseCard[]> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  let query = sb
    .from("courses")
    .select(
      "slug,cat,is_bac,photo_card_url,course_translations!inner(name,designation,quote,duration,level)",
    )
    .eq("course_translations.lang", lang)
    .order("created_at")
    .limit(opts.limit ?? 16);
  if (opts.filter === "bac") query = query.eq("is_bac", true);
  else if (opts.filter === "tech" || opts.filter === "other") query = query.eq("cat", opts.filter);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    slug: string; cat: string; is_bac: boolean; photo_card_url: string | null;
    course_translations: { name: string; designation: string; quote: string; duration: string; level: string }[];
  }>;
  const needle = (opts.q ?? "").trim().toLowerCase();
  return rows
    .map((r) => {
      const t = r.course_translations[0];
      return {
        slug: r.slug, cat: r.cat, is_bac: r.is_bac,
        name: t?.name ?? "", designation: t?.designation ?? "",
        quote: t?.quote ?? "", duration: t?.duration ?? "",
        level: t?.level ?? "", photo_card_url: r.photo_card_url,
      };
    })
    .filter((c) =>
      !needle || `${c.name} ${c.designation} ${c.quote}`.toLowerCase().includes(needle),
    );
}

export type CourseDetailDb = CourseCard & {
  lessons: string;
  schedule: string;
  seats_label: string;
  cta_label: string;
  outcomes: string[];
  price_cents: number | null;
  photo_detail_url: string | null;
  seats_n: number;
  instructor: { name: string; spec: string; bio: string } | null;
  modules: { sort_order: number; title: string; description: string; mins: number }[];
};

export async function getCourseDb(slug: string, lang: Lang): Promise<CourseDetailDb | null> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb
    .from("courses")
    .select(
      "slug,cat,is_bac,seats_n,price_cents,photo_card_url,photo_detail_url," +
        "course_translations!inner(name,designation,quote,duration,lessons,schedule,level,seats_label,cta_label,outcomes)," +
        "instructors(name_en,name_ar,spec_en,spec_ar,bio_en,bio_ar)",
    )
    .eq("slug", slug)
    .eq("course_translations.lang", lang)
    .single();
  if (error || !data) return null;
  const c = data as unknown as {
    slug: string; cat: string; is_bac: boolean; seats_n: number;
    price_cents: number | null; photo_card_url: string | null; photo_detail_url: string | null;
    course_translations: { name: string; designation: string; quote: string; duration: string; lessons: string; schedule: string; level: string; seats_label: string; cta_label: string; outcomes: string[] }[];
    instructors: { name_en: string; name_ar: string; spec_en: string; spec_ar: string; bio_en: string; bio_ar: string } | null;
  };
  const t = c.course_translations[0];
  const { data: mods } = await sb
    .from("modules")
    .select("sort_order,module_translations!inner(title,description),videos(mins)")
    .eq("course_id", (await courseIdBySlug(slug)) ?? "")
    .eq("module_translations.lang", lang)
    .order("sort_order");
  const pick = (en: string, ar: string) => (lang === "ar" ? ar || en : en || ar);
  return {
    slug: c.slug, cat: c.cat, is_bac: c.is_bac,
    name: t.name, designation: t.designation ?? "", quote: t.quote ?? "",
    duration: t.duration ?? "", lessons: t.lessons ?? "", schedule: t.schedule ?? "",
    level: t.level ?? "", seats_label: t.seats_label ?? "", cta_label: t.cta_label ?? "",
    outcomes: t.outcomes ?? [], price_cents: c.price_cents,
    photo_card_url: c.photo_card_url, photo_detail_url: c.photo_detail_url,
    seats_n: c.seats_n,
    instructor: c.instructors
      ? {
          name: pick(c.instructors.name_en, c.instructors.name_ar),
          spec: pick(c.instructors.spec_en ?? "", c.instructors.spec_ar ?? ""),
          bio: pick(c.instructors.bio_en ?? "", c.instructors.bio_ar ?? ""),
        }
      : null,
    modules: ((mods ?? []) as unknown as Array<{
      sort_order: number;
      module_translations: { title: string; description: string }[];
      videos: { mins: number }[];
    }>).map((m) => ({
      sort_order: m.sort_order,
      title: m.module_translations[0]?.title ?? "",
      description: m.module_translations[0]?.description ?? "",
      mins: m.videos[0]?.mins ?? 10,
    })),
  };
}

async function courseIdBySlug(slug: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.from("courses").select("id").eq("slug", slug).single();
  return (data as { id: string } | null)?.id ?? null;
}
