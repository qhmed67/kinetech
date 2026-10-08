import { supabase } from "./client";
import { NETWORK_TIMEOUT_MS, throttle, withTimeout } from "./throttle";

export type SearchKind = "national_id" | "phone" | "email";

export type FoundUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  national_id: string | null;
  grade: string | null;
  role: string;
  banned: boolean;
  tracks: string[];
  enrolled: string[];
};

const SEARCH_COOLDOWN_MS = 1500;

function authed() {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  return sb;
}

/**
 * Targeted exact-match lookup. Runs ONLY on explicit admin submit —
 * never on mount, no wildcards, no full-table scans.
 */
export async function searchUser(kind: SearchKind, value: string): Promise<FoundUser | null> {
  if (!throttle(`admin-search-${kind}`, SEARCH_COOLDOWN_MS)) throw new Error("too many attempts");
  const sb = authed();
  const needle = value.trim();
  if (!needle) return null;
  const column = kind === "national_id" ? "national_id" : kind;
  // Indexed exact-match (.eq on UNIQUE columns) + single row + lean columns:
  // B-tree seek, zero scans, minimal payload. maybeSingle avoids throwing
  // on zero rows (no exception overhead for the common miss path).
  const { data: p, error } = await withTimeout(
    (async () =>
      sb.from("profiles")
        .select("id,email,name,phone,national_id,grade,role,banned")
        .eq(column, kind === "email" ? needle.toLowerCase() : needle)
        .limit(1)
        .maybeSingle())(),
    NETWORK_TIMEOUT_MS,
    "user-search",
  );
  if (error || !p) return null;
  const prof = p as unknown as Omit<FoundUser, "tracks" | "enrolled">;
  const [{ data: tr }, { data: en }] = await withTimeout(
    Promise.all([
      sb.from("user_tracks").select("track").eq("user_id", prof.id),
      sb.from("enrollments").select("courses!inner(slug)").eq("user_id", prof.id),
    ]),
    NETWORK_TIMEOUT_MS,
    "user-detail",
  );
  const rows = (en ?? []) as unknown as Array<{ courses: { slug: string } | Array<{ slug: string }> }>;
  return {
    ...prof,
    tracks: ((tr ?? []) as Array<{ track: string }>).map((t) => t.track),
    enrolled: rows
      .map((r) => (Array.isArray(r.courses) ? r.courses[0]?.slug : r.courses.slug))
      .filter(Boolean) as string[],
  };
}

/** Grant access (idempotent upsert). Admin-only via RLS. */
export async function grantEnrollment(userId: string, courseSlug: string): Promise<void> {
  if (!throttle(`grant-${userId}`, 3000)) throw new Error("too many attempts");
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { error } = await withTimeout(
    (async () => sb.from("enrollments").upsert({ user_id: userId, course_id: courseId }, { onConflict: "user_id,course_id" }))(),
    NETWORK_TIMEOUT_MS,
    "grant",
  );
  if (error) throw error;
}

/** Revoke access. Admin-only via RLS. */
export async function revokeEnrollment(userId: string, courseSlug: string): Promise<void> {
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { error } = await withTimeout(
    (async () => sb.from("enrollments").delete().eq("user_id", userId).eq("course_id", courseId))(),
    NETWORK_TIMEOUT_MS,
    "revoke",
  );
  if (error) throw error;
}

/** Suspend / unsuspend. Banned users are signed out and blocked everywhere. */
export async function setBanned(userId: string, banned: boolean): Promise<void> {
  const sb = authed();
  const { error } = await withTimeout(
    (async () => sb.from("profiles").update({ banned }).eq("id", userId))(),
    NETWORK_TIMEOUT_MS,
    "ban",
  );
  if (error) throw error;
}

export type Orphan = { user_id: string; email: string; created_at: string };

/** Admin-only: auth accounts with no profile row. Empty = healthy. */
export async function listOrphans(): Promise<Orphan[]> {
  const sb = authed();
  const { data, error } = await withTimeout(
    (async () => sb.rpc("list_orphans"))(),
    NETWORK_TIMEOUT_MS,
    "orphans",
  );
  if (error) throw error;
  return ((data ?? []) as unknown as Orphan[]).map((r) => ({
    user_id: r.user_id,
    email: r.email,
    created_at: r.created_at,
  }));
}

/**
 * Delete the profile row (cascades tracks, views, enrollments).
 * NOTE: the Supabase Auth account itself can only be deleted from the
 * dashboard or with the service-role key — without a profile the account
 * cannot sign in to anything (session restore fails closed).
 */
export async function deleteProfile(userId: string): Promise<void> {
  const sb = authed();
  const { error } = await withTimeout(
    (async () => sb.from("profiles").delete().eq("id", userId))(),
    NETWORK_TIMEOUT_MS,
    "delete-user",
  );
  if (error) throw error;
}
