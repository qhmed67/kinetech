/* Web services store port — reads the same tables the web syncs
 * (service_translations / service_posts / process_steps) so the mobile
 * service pages render identical copy. Slugs are fixed: marketing,
 * software, design (same taxonomy as the web's Services nav). */

import { getSupabase } from "../supabase";

export type Lang = "en" | "ar";
export type Post = { title: string; text: string; image: string; link: string };
export type Module = { t: string; d: string };

export type ServiceData = {
  slug: string;
  title: string;
  desc: string;
  items: string[];
  gets: string[];
  posts: Post[];
};

export const SERVICE_SLUGS = ["marketing", "software", "design"] as const;
export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

type TrRow = {
  service_slug: string;
  lang: string;
  title: string | null;
  description: string | null;
  items: string[] | null;
  gets: string[] | null;
};

type PostRow = {
  service_slug: string;
  lang: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link: string | null;
};

type StepRow = {
  sort_order: number;
  title_en: string | null;
  title_ar: string | null;
  desc_en: string | null;
  desc_ar: string | null;
};

async function loadTranslations(lang: Lang): Promise<TrRow[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb
    .from("service_translations")
    .select("service_slug,lang,title,description,items,gets");
  if (error) throw error;
  return ((data ?? []) as unknown) as TrRow[];
}

async function loadPosts(lang: Lang): Promise<PostRow[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb
    .from("service_posts")
    .select("service_slug,lang,title,body,image_url,link,sort_order")
    .order("sort_order");
  if (error) throw error;
  return (((data ?? []) as unknown) as PostRow[]).filter((p) => p.lang === lang);
}

/** One service page's copy (web getService + getPosts). */
export async function getService(slug: ServiceSlug, lang: Lang): Promise<ServiceData> {
  const rows = await loadTranslations(lang);
  const tr =
    rows.find((r) => r.service_slug === slug && r.lang === lang) ??
    rows.find((r) => r.service_slug === slug && r.lang === "en") ??
    rows.find((r) => r.service_slug === slug);
  const posts = (await loadPosts(lang))
    .filter((p) => p.service_slug === slug)
    .map((p) => ({
      title: p.title,
      text: p.body ?? "",
      image: p.image_url ?? "",
      link: p.link ?? "",
    }));
  return {
    slug,
    title: tr?.title ?? slug,
    desc: tr?.description ?? "",
    items: tr?.items ?? [],
    gets: tr?.gets ?? [],
    posts,
  };
}

/** The "how we work" steps (web getProcess). */
export async function getProcess(lang: Lang): Promise<Module[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb
    .from("process_steps")
    .select("sort_order,title_en,title_ar,desc_en,desc_ar")
    .order("sort_order");
  if (error) throw error;
  const rows = ((data ?? []) as unknown) as StepRow[];
  return rows
    .filter((r) => r.sort_order >= 0)
    .map((r) => ({
      t: (lang === "ar" ? r.title_ar || r.title_en : r.title_en || r.title_ar) ?? "",
      d: (lang === "ar" ? r.desc_ar || r.desc_en : r.desc_en || r.desc_ar) ?? "",
    }));
}

/** Titles of the other services (for the cross-links row). */
export async function listServiceTitles(lang: Lang): Promise<Record<ServiceSlug, string>> {
  const rows = await loadTranslations(lang);
  const out = { marketing: "", software: "", design: "" } as Record<ServiceSlug, string>;
  for (const slug of SERVICE_SLUGS) {
    const tr =
      rows.find((r) => r.service_slug === slug && r.lang === lang) ??
      rows.find((r) => r.service_slug === slug);
    out[slug] = tr?.title ?? slug;
  }
  return out;
}
