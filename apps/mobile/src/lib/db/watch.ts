import { supabase } from "../supabase";

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
}

export async function getWatchState(courseSlug: string, lang: "en" | "ar"): Promise<WatchRow[]> {
  const { data, error } = await supabase
    .from("course_parts")
    .select("*")
    .eq("course_slug", courseSlug)
    .order("sort_order");

  if (error) {
    console.error("Error fetching watch state:", error);
    return [];
  }

  return data.map((part) => ({
    video_id: part.video_id,
    sort_order: part.sort_order,
    title: part.title[lang] || part.title.en,
    description: part.description?.[lang] || part.description?.en,
    mins: part.duration,
    views_count: part.views_count || 0,
    views_left: Math.max(0, 3 - (part.views_count || 0)),
    unlocked: part.unlocked || false,
    done: part.completed || false,
  }));
}

export async function touchUnlocked(videoId: string): Promise<void> {
  const { error } = await supabase
    .rpc("touch_unlocked", { video_id: videoId });

  if (error) {
    console.error("Error touching unlocked:", error);
  }
}

export async function completeVideo(
  videoId: string,
  watched: number,
  duration: number,
  notify: boolean = true
): Promise<void> {
  const { error } = await supabase
    .rpc("complete_video", {
      video_id: videoId,
      watched: watched,
      duration: duration,
      notify: notify,
    });

  if (error) {
    console.error("Error completing video:", error);
  }
}