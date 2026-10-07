import { supabase } from "./client";
import { throttle } from "./throttle";
import type { EnrollmentStatus } from "./authDb";

/** Student requests access after WhatsApp payment → row starts as pending. */
export async function requestEnrollmentDb(courseSlug: string): Promise<EnrollmentStatus> {
  if (!throttle(`enroll-${courseSlug}`, 3000)) throw new Error("too many attempts");
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("not signed in");
  const { data: course } = await sb.from("courses").select("id").eq("slug", courseSlug).single();
  const courseId = (course as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { data, error } = await sb
    .from("enrollments")
    .upsert({ user_id: u.user.id, course_id: courseId, status: "pending" }, { onConflict: "user_id,course_id" })
    .select("status")
    .single();
  if (error) throw error;
  return (data as { status: EnrollmentStatus }).status;
}

export async function myEnrollmentsDb(): Promise<Array<{ slug: string; status: EnrollmentStatus }>> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await sb
    .from("enrollments")
    .select("status,courses!inner(slug)")
    .eq("user_id", u.user.id);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    status: EnrollmentStatus; courses: { slug: string } | Array<{ slug: string }>;
  }>;
  return rows.map((r) => ({
    slug: Array.isArray(r.courses) ? r.courses[0]?.slug : r.courses.slug,
    status: r.status,
  })).filter((r) => Boolean(r.slug)) as Array<{ slug: string; status: EnrollmentStatus }>;
}

/** Admin: approve/reject after verifying WhatsApp payment. RLS restricts to admins. */
export async function decideEnrollmentDb(
  userId: string,
  courseSlug: string,
  decision: EnrollmentStatus,
): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data: course } = await sb.from("courses").select("id").eq("slug", courseSlug).single();
  const courseId = (course as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { error } = await sb
    .from("enrollments")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("course_id", courseId);
  if (error) throw error;
}

/** Admin queue: all pending requests with user + course slugs. */
export async function pendingEnrollmentsDb(): Promise<
  Array<{ user_id: string; email: string; name: string; slug: string; enrolled_at: string }>
> {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  const { data, error } = await sb
    .from("enrollments")
    .select("user_id,enrolled_at,profiles!inner(email,name),courses!inner(slug)")
    .eq("status", "pending")
    .order("enrolled_at");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    user_id: string; enrolled_at: string;
    profiles: { email: string; name: string } | Array<{ email: string; name: string }>;
    courses: { slug: string } | Array<{ slug: string }>;
  }>;
  return rows.map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const course = Array.isArray(r.courses) ? r.courses[0] : r.courses;
    return {
      user_id: r.user_id, email: prof?.email ?? "", name: prof?.name ?? "",
      slug: course?.slug ?? "", enrolled_at: r.enrolled_at,
    };
  }).filter((r) => Boolean(r.slug));
}
