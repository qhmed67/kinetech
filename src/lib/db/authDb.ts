import { supabase } from "./client";
import { NETWORK_TIMEOUT_MS, throttle, withTimeout } from "./throttle";
import type { TrackId } from "../../auth";

/* Brute-force friction: min gap between attempts per action. Server-side
   Supabase Auth rate limits + captcha must still be enabled on dashboard. */
const AUTH_COOLDOWN_MS = 3000;

export type DbRole = "student" | "admin";
export type EnrollmentStatus = "pending" | "approved";

export type DbProfile = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  national_id: string | null;
  grade: "sec1" | "sec2" | null;
  role: DbRole;
};

/** Lean login payload — never fetch courses/views here. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  /** Verified contact, also feeds the video watermark. */
  phone: string;
  role: DbRole;
  tracks: TrackId[];
  /** Admin-granted course slugs. */
  enrolled: string[];
  banned: boolean;
};

export async function signUpDb(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  nationalId?: string;
  grade?: "sec1" | "sec2";
  track: TrackId;
}): Promise<SessionUser> {
  if (!throttle("auth-signup", AUTH_COOLDOWN_MS)) throw new Error("too many attempts");
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await withTimeout(
    sb.auth.signUp({ email: input.email, password: input.password }),
    NETWORK_TIMEOUT_MS,
    "signup",
  );
  if (error || !data.user) throw error ?? new Error("signup failed");
  const uid = data.user.id;
  // Upserts: the DB trigger may have already created the skeleton row.
  const { error: pErr } = await sb.from("profiles").upsert(
    {
      id: uid,
      email: input.email,
      name: input.name,
      phone: input.phone,
      national_id: input.nationalId ?? null,
      grade: input.grade ?? null,
    },
    { onConflict: "id" },
  );
  if (pErr) throw pErr;
  const { error: tErr } = await sb
    .from("user_tracks")
    .upsert({ user_id: uid, track: input.track }, { onConflict: "user_id,track" });
  if (tErr) throw tErr;
  return { id: uid, email: input.email, name: input.name, phone: input.phone, role: "student", tracks: [input.track], enrolled: [], banned: false };
}

export async function signInDb(email: string, password: string): Promise<SessionUser> {
  if (!throttle("auth-signin", AUTH_COOLDOWN_MS)) throw new Error("too many attempts");
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await withTimeout(
    sb.auth.signInWithPassword({ email, password }),
    NETWORK_TIMEOUT_MS,
    "login",
  );
  if (error || !data.user) throw error ?? new Error("login failed");
  return loadSessionUser(data.user.id);
}

/** One profiles row + tracks. No SELECT *. */
export async function loadSessionUser(uid: string): Promise<SessionUser> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const [{ data: p, error }, { data: tr }, { data: en }] = await withTimeout(
    Promise.all([
      sb.from("profiles").select("id,email,name,phone,role,banned").eq("id", uid).single(),
      sb.from("user_tracks").select("track").eq("user_id", uid),
      sb.from("enrollments").select("courses!inner(slug)").eq("user_id", uid),
    ]),
    NETWORK_TIMEOUT_MS,
    "session",
  );
  if (error || !p) throw error ?? new Error("profile missing");
  const prof = p as DbProfile & { banned: boolean };
  const enRows = (en ?? []) as unknown as Array<{ courses: { slug: string } | Array<{ slug: string }> }>;
  return {
    id: prof.id,
    email: prof.email,
    name: prof.name,
    phone: prof.phone ?? "",
    role: prof.role,
    tracks: ((tr ?? []) as { track: TrackId }[]).map((t) => t.track),
    enrolled: enRows.map((e) => (Array.isArray(e.courses) ? e.courses[0]?.slug : e.courses.slug)).filter(Boolean) as string[],
    banned: prof.banned ?? false,
  };
}

export async function signOutDb(): Promise<void> {
  await supabase()?.auth.signOut();
}
