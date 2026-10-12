import { supabase } from "./client";
import { NETWORK_TIMEOUT_MS, throttle, withTimeout } from "./throttle";

export type UpcomingSession = {
  id: string;
  title: string;
  date: string;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
};

/** Future sessions first, capped for the overview card.
    7-day grace behind now: lesson notices carry server time, and a student
    device clock running ahead (wrong timezone/DST) must never hide rows
    that exist. FIFO keeps each user at 5 rows regardless. */
export async function getUpcomingSessions(limit = 5): Promise<UpcomingSession[]> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await withTimeout(
    (async () =>
      sb.from("upcoming_sessions").select("id,title,date").gte("date", weekAgo).order("date").limit(limit))(),
    NETWORK_TIMEOUT_MS,
    "sessions",
  );
  if (error) throw error;
  return ((data ?? []) as unknown as UpcomingSession[]).map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
  }));
}

export async function getNotifications(limit = 10): Promise<Notification[]> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await withTimeout(
    (async () =>
      sb.from("notifications").select("id,title,message,is_read").order("created_at", { ascending: false }).limit(limit))(),
    NETWORK_TIMEOUT_MS,
    "notifications",
  );
  if (error) throw error;
  return ((data ?? []) as unknown as Notification[]).map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message ?? "",
    is_read: r.is_read,
  }));
}

/** Viewing the overview clears the unread badge (owner-only RLS). */
export async function markNotificationsRead(): Promise<void> {
  if (!throttle("notif-read", 10000)) return;
  const sb = supabase();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await sb.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
  } catch {
    /* badge stays — next visit retries */
  }
}
