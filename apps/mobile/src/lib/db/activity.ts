import { getSupabase } from "../supabase";

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  is_read: boolean;
  created_at: string;
}

export interface UpcomingSession {
  id: string;
  title: string;
  date: string;
  description?: string;
}

function l(obj: any): string {
  if (!obj) return "";
  return obj.en || "";
}

export async function getNotifications(limit = 10): Promise<AppNotification[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((n: any) => ({
    id: n.id,
    title: l(n.title),
    message: l(n.message) || undefined,
    is_read: n.is_read ?? false,
    created_at: n.created_at,
  }));
}

export async function getUpcomingSessions(limit = 5): Promise<UpcomingSession[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb
    .from("sessions")
    .select("*")
    .order("date", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((s: any) => ({
    id: s.id,
    title: l(s.title),
    date: s.date,
    description: l(s.description) || undefined,
  }));
}

export async function markNotificationsRead(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { error } = await sb
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
}
