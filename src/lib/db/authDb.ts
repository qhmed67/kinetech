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
  /** approved course slugs only (pending excluded until admin approves) */
  enrolled: string[];
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
  const { error: pErr } = await sb.from("profiles").insert({
    id: uid,
    email: input.email,
    name: input.name,
    phone: input.phone,
    national_id: input.nationalId ?? null,
    grade: input.grade ?? null,
  });
  if (pErr) throw pErr;
  const { error: tErr } = await sb
    .from("user_tracks")
    .insert({ user_id: uid, track: input.track });
  if (tErr) throw tErr;
  return { id: uid, email: input.email, name: input.name, phone: input.phone, role: "student", tracks: [input.track], enrolled: [] };
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

/** One profiles row + tracks + approved enrollments. No SELECT *. */
export async function loadSessionUser(uid: string): Promise<SessionUser> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const [{ data: p, error }, { data: tr }, { data: en }] = await withTimeout(
    Promise.all([
      sb.from("profiles").select("id,email,name,phone,role").eq("id", uid).single(),
      sb.from("user_tracks").select("track").eq("user_id", uid),
      sb.from("enrollments").select("course_id,courses!inner(slug)").eq("user_id", uid).eq("status", "approved"),
    ]),
    NETWORK_TIMEOUT_MS,
    "session",
  );
  if (error || !p) throw error ?? new Error("profile missing");
  const enRows = (en ?? []) as unknown as Array<{ courses: { slug: string } | Array<{ slug: string }> }>;
  return {
    id: (p as DbProfile).id,
    email: (p as DbProfile).email,
    name: (p as DbProfile).name,
    phone: (p as DbProfile).phone ?? "",
    role: (p as DbProfile).role,
    tracks: ((tr ?? []) as { track: TrackId }[]).map((t) => t.track),
    enrolled: enRows.map((e) => (Array.isArray(e.courses) ? e.courses[0]?.slug : e.courses.slug)).filter(Boolean) as string[],
  };
}

export async function signOutDb(): Promise<void> {
  await supabase()?.auth.signOut();
}
