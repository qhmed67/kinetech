import { supabase } from "../supabase";

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

export async function getNotifications(limit: number = 10): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }

  return data.map((notification) => ({
    id: notification.id,
    title: notification.title.en,
    message: notification.message?.en,
    is_read: notification.is_read,
    created_at: notification.created_at,
  }));
}

export async function getUpcomingSessions(limit: number = 5): Promise<UpcomingSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("date", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }

  return data.map((session) => ({
    id: session.id,
    title: session.title.en,
    date: session.date,
    description: session.description?.en,
  }));
}

export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);

  if (error) {
    console.error("Error marking notifications as read:", error);
  }
}