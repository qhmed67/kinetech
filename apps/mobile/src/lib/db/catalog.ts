import { supabase } from "../supabase";

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

export async function listCourses(lang: "en" | "ar", options?: {
  limit?: number;
}): Promise<Course[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("sort_order");

  if (error) {
    console.error("Error fetching courses:", error);
    return [];
  }

  // Map the data to match our interface
  return data.map((course) => ({
    slug: course.slug,
    name: course.name[lang] || course.name.en,
    designation: course.designation[lang] || course.designation.en,
    description: course.description[lang] || course.description.en,
    image: course.image_url,
    isBac: course.category === "bac",
    cat: course.category,
    sort_order: course.sort_order,
  }));
}

export async function getCourseBySlug(slug: string, lang: "en" | "ar"): Promise<Course | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    console.error("Error fetching course:", error);
    return null;
  }

  return {
    slug: data.slug,
    name: data.name[lang] || data.name.en,
    designation: data.designation[lang] || data.designation.en,
    description: data.description[lang] || data.description.en,
    image: data.image_url,
    isBac: data.category === "bac",
    cat: data.category,
    sort_order: data.sort_order,
  };
}