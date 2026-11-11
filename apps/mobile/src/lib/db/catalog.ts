import { getSupabase } from "../supabase";

export type Lang = "en" | "ar";
export type Module = { t: string; d: string };

/** Web CourseView (apps/web/src/store.ts) — the exact shape every web page
 *  renders. Mobile screens consume the same fields for visual parity. */
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
  sections: string[];
};

export type CatalogFilter = "all" | "bac" | "tech" | "other";

function priceText(cents: number, lang: Lang): string | null {
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-EG", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    }).format(cents);
  } catch {
    return `${cents} EGP`;
  }
}

/** Web formatSchedule: bare weekday/time pass through; ISO dates localize. */
export function formatSchedule(value: string, lang: Lang): string {
  const v = value.trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    try {
      return new Date(v).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
        day: "numeric",
        month: "long",
      });
    } catch {
      return v;
    }
  }
  return v;
}

type CardRow = {
  slug: string;
  cat: string;
  is_bac: boolean;
  photo_card_url: string | null;
  course_translations: {
    name: string;
    designation: string;
    quote: string;
    duration: string;
    level: string;
  }[];
};

/** Web listCoursesDb — lean catalog filtered by locale (translation join). */
export async function listCourses(
  lang: Lang,
  opts: { filter?: CatalogFilter; q?: string; limit?: number } = {},
): Promise<CourseView[]> {
  const sb = getSupabase();
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
  const rows = (data ?? []) as unknown as CardRow[];
  const needle = (opts.q ?? "").trim().toLowerCase();
  return rows
    .map((r) => {
      const t = r.course_translations[0];
      return {
        slug: r.slug,
        cat: r.cat,
        bac: r.is_bac,
        cta: "",
        name: t?.name ?? "",
        designation: t?.designation ?? "",
        quote: t?.quote ?? "",
        duration: t?.duration ?? "",
        lessons: "",
        schedule: "",
        level: t?.level ?? "",
        seats: "",
        seatsN: 0,
        price: null,
        photoCard: r.photo_card_url ?? "",
        photoDetail: r.photo_card_url ?? "",
        instructor: { name: "", spec: "", bio: "" },
        outcomes: [],
        modules: [],
        sections: [],
      };
    })
    .filter(
      (c) =>
        !needle ||
        `${c.name} ${c.designation} ${c.quote}`.toLowerCase().includes(needle),
    );
}

/** Web getCourseDb — full detail: translations + instructor + modules. */
export async function getCourse(
  slug: string,
  lang: Lang,
): Promise<CourseView | null> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb
    .from("courses")
    .select(
      "id,slug,cat,is_bac,seats_n,price_cents,photo_card_url,photo_detail_url," +
        "course_translations!inner(name,designation,quote,duration,lessons,schedule,level,seats_label,cta_label,outcomes)," +
        "instructors(name_en,name_ar,spec_en,spec_ar,bio_en,bio_ar)",
    )
    .eq("slug", slug)
    .eq("course_translations.lang", lang)
    .single();
  if (error || !data) return null;

  const c = data as unknown as {
    id: string;
    slug: string;
    cat: string;
    is_bac: boolean;
    seats_n: number;
    price_cents: number | null;
    photo_card_url: string | null;
    photo_detail_url: string | null;
    course_translations: {
      name: string;
      designation: string;
      quote: string;
      duration: string;
      lessons: string;
      schedule: string;
      level: string;
      seats_label: string;
      cta_label: string;
      outcomes: string[] | null;
    }[];
    instructors: {
      name_en: string;
      name_ar: string;
      spec_en: string;
      spec_ar: string;
      bio_en: string;
      bio_ar: string;
    } | null;
  };
  const t = c.course_translations[0];
  const pick = (en: string, ar: string) => (lang === "ar" ? ar || en : en || ar);

  const { data: mods } = await sb
    .from("modules")
    .select("sort_order,module_translations!inner(title,description),videos(mins)")
    .eq("course_id", c.id)
    .eq("module_translations.lang", lang)
    .order("sort_order");

  const modRows = (mods ?? []) as unknown as Array<{
    sort_order: number;
    module_translations: { title: string; description: string }[];
    videos: { mins: number }[];
  }>;

  return {
    slug: c.slug,
    cat: c.cat,
    bac: c.is_bac,
    cta: t?.cta_label ?? "",
    name: t?.name ?? "",
    designation: t?.designation ?? "",
    quote: t?.quote ?? "",
    duration: t?.duration ?? "",
    lessons: t?.lessons ?? "",
    schedule: formatSchedule(t?.schedule ?? "", lang),
    level: t?.level ?? "",
    seats: t?.seats_label ?? "",
    seatsN: c.seats_n ?? 0,
    price:
      c.price_cents == null ? null : priceText(c.price_cents, lang),
    photoCard: c.photo_card_url ?? "",
    photoDetail: c.photo_detail_url ?? c.photo_card_url ?? "",
    instructor: c.instructors
      ? {
          name: pick(c.instructors.name_en, c.instructors.name_ar),
          spec: pick(c.instructors.spec_en ?? "", c.instructors.spec_ar ?? ""),
          bio: pick(c.instructors.bio_en ?? "", c.instructors.bio_ar ?? ""),
        }
      : { name: "", spec: "", bio: "" },
    outcomes: t?.outcomes ?? [],
    modules: modRows.map((m) => ({
      t: m.module_translations[0]?.title ?? "",
      d: m.module_translations[0]?.description ?? "",
    })),
    sections: modRows.map(() => ""),
  };
}

export async function courseExists(slug: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("courses")
    .select("slug")
    .eq("slug", slug)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Legacy alias used by earlier screens. */
export type Course = CourseView;
export type CourseCard = CourseView;
