import { getSupabase } from "../supabase";

export interface Course {
  slug: string;
  name: string;
  designation: string;
  description: string;
  image?: string;
  isBac?: boolean;
  cat: "tech" | "other" | "bac";
  sort_order: number;
}

export type CatalogFilter = "all" | "bac" | "tech" | "other";

function l(obj: any, lang: "en" | "ar"): string {
  if (!obj) return "";
  return obj[lang] || obj.en || "";
}

function mapCourse(raw: any, lang: "en" | "ar"): Course {
  return {
    slug: raw.slug,
    name: l(raw.name, lang),
    designation: l(raw.designation, lang),
    description: l(raw.description, lang),
    image: raw.image_url ?? undefined,
    isBac: raw.category === "bac",
    cat: raw.category,
    sort_order: raw.sort_order ?? 0,
  };
}

export async function listCourses(
  lang: "en" | "ar",
  options?: { limit?: number },
): Promise<Course[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  let q = sb.from("courses").select("*").order("sort_order");
  if (options?.limit) q = q.limit(options.limit);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((raw: any) => mapCourse(raw, lang));
}

export async function getCourseBySlug(
  slug: string,
  lang: "en" | "ar",
): Promise<Course | null> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return mapCourse(data, lang);
}

/** Alias kept for screen imports (`type CourseCard as Course`). */
export type CourseCard = Course;
