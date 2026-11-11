/* Web activityDb port (apps/web/src/lib/db/activityDb.ts).
 * Personal scope: the RLS bypass for admins (is_admin() in the read
 * policies) shows EVERY user's rows to admin sessions — personal surfaces
 * must filter to self explicitly, or one student's notice reads as
 * "sent to all users". No session = no rows (matches RLS). */

import { getSupabase } from "../supabase";
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
  created_at: string;
};

export type AppNotification = Notification;
export type SessionRow = UpcomingSession;

async function ownUid(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Newest first (FIFO): the latest lesson notice tops the widget.
    7-day grace behind now: lesson notices carry server time, and a student
    device clock running ahead (wrong timezone/DST) must never hide rows
    that exist. FIFO keeps each user at 5 rows regardless. */
export async function getUpcomingSessions(limit = 5): Promise<UpcomingSession[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const uid = await ownUid();
  if (!uid) return [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await withTimeout(
    (async () =>
      sb.from("upcoming_sessions").select("id,title,date").eq("user_id", uid).gte("date", weekAgo).order("date", { ascending: false }).limit(limit))(),
    NETWORK_TIMEOUT_MS,
    "sessions",
  );
  if (error) throw error;
  return (((data ?? []) as unknown) as UpcomingSession[]).map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
  }));
}

export async function getNotifications(limit = 10): Promise<Notification[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const uid = await ownUid();
  if (!uid) return [];
  const { data, error } = await withTimeout(
    (async () =>
      sb.from("notifications").select("id,title,message,is_read,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit))(),
    NETWORK_TIMEOUT_MS,
    "notifications",
  );
  if (error) throw error;
  return (((data ?? []) as unknown) as Notification[]).map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message ?? "",
    is_read: r.is_read,
    created_at: r.created_at ?? "",
  }));
}

/** Viewing the overview clears the unread badge (owner-only RLS). */
export async function markNotificationsRead(): Promise<void> {
  if (!throttle("notif-read", 10000)) return;
  const sb = getSupabase();
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
