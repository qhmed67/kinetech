import { getSupabase } from "../supabase";

export interface WatchRow {
  video_id: string;
  sort_order: number;
  title: string;
  description?: string;
  mins?: number;
  views_count: number;
  views_left: number;
  unlocked: boolean;
  done: boolean;
  assign_url?: string;
  exam_url?: string;
}

function l(obj: any, lang: "en" | "ar"): string {
  if (!obj) return "";
  return obj[lang] || obj.en || "";
}

export async function getWatchState(
  courseSlug: string,
  lang: "en" | "ar",
): Promise<WatchRow[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb
    .from("course_parts")
    .select("*")
    .eq("course_slug", courseSlug)
    .order("sort_order");

  if (error) throw error;

  return (data ?? []).map((part: any) => ({
    video_id: part.video_id,
    sort_order: part.sort_order,
    title: l(part.title, lang),
    description: l(part.description, lang) || undefined,
    mins: part.duration ?? part.mins ?? undefined,
    views_count: part.views_count ?? 0,
    views_left: Math.max(0, 3 - (part.views_count ?? 0)),
    unlocked: part.unlocked ?? false,
    done: part.done ?? false,
    assign_url: part.assign_url ?? undefined,
    exam_url: part.exam_url ?? undefined,
  }));
}

/** Sticky unlock: opening an entitled part keeps it open (no view burned). */
export async function touchUnlocked(videoId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { error } = await sb.rpc("touch_unlocked", { p_video_id: videoId });
  if (error) throw error;
}

/** Completion = video end. Server RPC re-enforces caps/locks. */
export async function completeVideo(
  videoId: string,
  watched: number,
  duration: number,
  notify = false,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { error } = await sb.rpc("complete_video", {
    p_video_id: videoId,
    p_watched: watched,
    p_duration: duration,
    p_notify: notify,
  });
  if (error) throw error;
}
