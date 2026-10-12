import { supabase } from "./client";
import type { Lang } from "../../i18n";

export type WatchRow = {
  video_id: string;
  sort_order: number;
  title: string;
  description: string;
  src_url: string;
  mins: number;
  assign_url: string | null;
  exam_url: string | null;
  views_count: number;
  done: boolean;
  unlocked: boolean;
  views_left: number;
};

/** Single RPC: videos + per-user views + sequential unlock. No N+1. */
export async function getWatchStateDb(slug: string, lang: Lang): Promise<WatchRow[]> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb.rpc("get_watch_state", { p_slug: slug, p_lang: lang });
  if (error) throw error;
  return (data ?? []) as WatchRow[];
}

/** Increments capped at 3, enforces N-1 unlock server-side. */
export async function recordPlayDb(videoId: string): Promise<{ views_count: number; views_left: number }> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb.rpc("record_play", { p_video: videoId });
  if (error) throw error;
  const row = ((data ?? []) as Array<{ views_count: number; views_left: number }>)[0];
  return row ?? { views_count: 0, views_left: 0 };
}

/**
 * Persist "this part was opened while entitled" without burning a view.
 * The server re-checks the sequential rule — skipping ahead stays locked.
 */
export async function touchUnlockedDb(videoId: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { error } = await sb.rpc("touch_unlocked", { p_video: videoId });
  if (error) throw error;
}

/**
 * Version-tolerant completion: tries the 4-param shape (p_video,
 * p_watched_secs, p_duration_secs, p_ended) first, then the 3-param, then
 * the legacy 2-param. A 42883 (unknown shape) falls through instead of
 * silently dropping the completion.
 */
export async function completeVideoDb(
  videoId: string,
  watchedSecs = 0,
  durationSecs = 0,
  ended = false,
): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const shapes: Array<Record<string, unknown>> = [
    { p_video: videoId, p_watched_secs: watchedSecs, p_duration_secs: durationSecs, p_ended: ended },
    { p_video: videoId, p_watched_secs: watchedSecs, p_duration_secs: durationSecs },
    { p_video: videoId, p_watched_secs: watchedSecs },
  ];
  let firstErr: { code?: string } | null = null;
  for (const shape of shapes) {
    const r = await sb.rpc("complete_video", shape);
    if (!r.error) return;
    if (r.error.code !== "42883") throw r.error;
    firstErr = r.error;
  }
  throw firstErr ?? new Error("complete_video failed");
}

/** Self-heal: first real playback reports the media's true duration and the
    server stores it on videos.mins. Best-effort — a DB without the
    report_video_mins migration (42883) simply keeps the admin/default value. */
export async function reportVideoMins(videoId: string, mins: number): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { error } = await sb.rpc("report_video_mins", { p_video: videoId, p_mins: mins });
  if (error && error.code !== "42883") throw error;
}

/** Watermark identity: lean profile read for overlay (email/phone). */export async function watermarkIdentityDb(): Promise<{ email: string; phone: string }> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { email: "", phone: "" };
  const { data } = await sb.from("profiles").select("email,phone").eq("id", u.user.id).single();
  const p = data as { email: string; phone: string | null } | null;
  return { email: p?.email ?? u.user.email ?? "", phone: p?.phone ?? "" };
}
