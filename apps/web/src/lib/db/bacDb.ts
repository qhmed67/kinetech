import { supabase } from "./client";
import type { Lang } from "../../i18n";

/** Baccalaureate hub: single JSONB doc per lang (terms/chapters/faq/mapping/resources). */
export async function getBacContentDb(lang: Lang): Promise<Record<string, unknown> | null> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb.from("bac_content").select("data").eq("lang", lang).single();
  if (error || !data) return null;
  return (data as { data: Record<string, unknown> }).data;
}
