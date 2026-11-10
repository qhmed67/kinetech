import { getSupabase } from "./lib/supabase";

export type KtUser = {
  name: string;
  email: string;
  phone: string;
  enrolled: string[];
  tracks: string[];
  role: "student" | "admin";
  banned: boolean;
};

export type TrackId = "courses" | "marketing" | "programming" | "design";

const KEY = "kt-user";

export const DEFAULT_TRACKS: string[] = ["courses"];

export async function getUser(): Promise<KtUser | null> {
  try {
    // For mobile, we'll use the Supabase session instead of localStorage
    const sb = getSupabase();
    if (!sb) return null;
    
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;
    
    // Return a basic user structure - we'll enhance this when we have the full profile
    return {
      name: user.user_metadata?.name || "",
      email: user.email || "",
      phone: user.user_metadata?.phone || "",
      enrolled: [],
      tracks: DEFAULT_TRACKS,
      role: "student",
      banned: false,
    };
  } catch {
    return null;
  }
}

export function setUser(u: KtUser) {
  try {
    // For mobile, we don't need to store user data locally since Supabase handles it
    // We'll just trigger a UI update
    void notifyUserChanged();
  } catch {
    /* ignore */
  }
}

/* Same-tab reactivity: App subscribes; cloud sync notifies after adopting
   the server session (storage events only fire cross-tab). */
type UserListener = () => void;
const userListeners = new Set<UserListener>();

export function subscribeUserChanged(fn: UserListener): () => void {
  userListeners.add(fn);
  return () => {
    userListeners.delete(fn);
  };
}

export function notifyUserChanged(): void {
  userListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/* Supabase auth path for mobile */
export async function signUpWithDb(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  nationalId?: string;
  grade?: "sec1" | "sec2";
  track: TrackId;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  
  const { data, error } = await sb.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.name,
        phone: input.phone,
        national_id: input.nationalId,
        grade: input.grade,
      },
    },
  });
  
  if (error) throw error;
  if (!data.user) throw new Error("signup failed");
  
  // Insert user profile
  const { error: profileError } = await sb.from("profiles").insert({
    id: data.user.id,
    email: input.email,
    name: input.name,
    phone: input.phone,
    national_id: input.nationalId ?? null,
    grade: input.grade ?? null,
    role: "student",
  });
  
  if (profileError) throw profileError;
  
  // Set user track
  const { error: trackError } = await sb
    .from("user_tracks")
    .insert({ user_id: data.user.id, track: input.track });
    
  if (trackError) throw trackError;
  
  // Set the user in local state
  setUser({
    name: input.name,
    email: input.email,
    phone: input.phone,
    enrolled: [],
    tracks: [input.track],
    role: "student",
    banned: false,
  });
  
  notifyUserChanged();
}

export async function signInWithDb(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");
  
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) throw error;
  if (!data.user) throw new Error("login failed");
  
  // Load user profile and tracks
  const profileResponse = await sb
    .from("profiles")
    .select("id, email, name, phone, role, banned")
    .eq("id", data.user.id)
    .single();
    
  if (profileResponse.error) throw profileResponse.error;
  
  const tracksResponse = await sb
    .from("user_tracks")
    .select("track")
    .eq("user_id", data.user.id);
    
  if (tracksResponse.error) throw tracksResponse.error;
  
  const enrollmentsResponse = await sb
    .from("enrollments")
    .select("courses!inner(slug)")
    .eq("user_id", data.user.id);
    
  if (enrollmentsResponse.error) throw enrollmentsResponse.error;
  
  const enRows = enrollmentsResponse.data || [];
  const enrolled = enRows.map((e: any) => e.courses.slug).filter(Boolean) as string[];
  
  const user = {
    id: data.user.id,
    name: profileResponse.data.name,
    email: profileResponse.data.email,
    phone: profileResponse.data.phone || "",
    role: profileResponse.data.role,
    tracks: tracksResponse.data?.map((t: any) => t.track) || [DEFAULT_TRACKS[0]],
    enrolled,
    banned: profileResponse.data.banned || false,
  };
  
  setUser(user);
  notifyUserChanged();
}

export async function signOutEverywhere(): Promise<void> {
  try {
    const sb = getSupabase();
    if (sb) {
      await sb.auth.signOut();
    }
  } catch {
    /* no cloud session */
  }
  clearUser();
  notifyUserChanged();
}

export function clearUser() {
  try {
    // For mobile, Supabase handles auth state, so we just clear local state
    void notifyUserChanged();
  } catch {
    /* ignore */
  }
}

export function initialsOf(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "KT";
}