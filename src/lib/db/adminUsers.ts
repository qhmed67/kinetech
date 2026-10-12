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
  // Late-enrolled students missed every notice fired at lesson creation —
  // backfill the 5 newest lessons into their sessions widget (FIFO keeps 5).
  // Best-effort: the grant already succeeded.
  try {
    const { data: vids } = await withTimeout(
      (async () => sb.from("videos").select("sort_order,module_id").eq("course_id", courseId)
        .order("sort_order", { ascending: false }).limit(5))(),
      NETWORK_TIMEOUT_MS,
      "grant-lessons",
    );
    const list = ((vids ?? []) as unknown as Array<{ sort_order: number; module_id: string }>);
    if (list.length > 0) {
      const modIds = [...new Set(list.map((v) => v.module_id))];
      const { data: trs } = await withTimeout(
        (async () => sb.from("module_translations").select("module_id,lang,title").in("module_id", modIds))(),
        NETWORK_TIMEOUT_MS,
        "grant-titles",
      );
      const rows = ((trs ?? []) as unknown as Array<{ module_id: string; lang: string; title: string }>);
      const titleOf = (mid: string) => {
        const mine = rows.filter((t) => t.module_id === mid);
        return mine.find((t) => t.lang === "ar")?.title?.trim()
          || mine.find((t) => t.lang === "en")?.title?.trim()
          || "New lesson";
      };
      const stamp = new Date().toISOString();
      await withTimeout(
        (async () => sb.from("upcoming_sessions").insert(
          list.map((v) => ({ user_id: userId, title: `New lesson · درس جديد: ${titleOf(v.module_id)}`, date: stamp })),
        ))(),
        NETWORK_TIMEOUT_MS,
        "grant-notices",
      );
    }
  } catch {
    /* grant stands; notices retry on next grant/save */
  }
}

/**
 * Revoke access AND wipe the slate: deletes the grant plus every view row
 * and exam attempt for that course. Re-enrolling later starts at absolute
 * zero — no resurrected bars, no old scores.
 * Admin-only via RLS.
 */
export async function revokeEnrollment(userId: string, courseSlug: string): Promise<void> {
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { data: vids } = await withTimeout(
    (async () => sb.from("videos").select("id").eq("course_id", courseId))(),
    NETWORK_TIMEOUT_MS,
    "video-lookup",
  );
  const ids = ((vids ?? []) as unknown as Array<{ id: string }>).map((v) => v.id);
  const ops: Array<Promise<unknown>> = [
    (async () => sb.from("enrollments").delete().eq("user_id", userId).eq("course_id", courseId))(),
  ];
  if (ids.length > 0) {
    ops.push(
      (async () => sb.from("video_views").delete().eq("user_id", userId).in("video_id", ids))(),
      (async () => sb.from("exam_results").delete().eq("user_id", userId).in("video_id", ids))(),
    );
  }
  // Stale lesson notices must not outlive the grant (sessions widget only —
  // real scheduled sessions carry custom titles and are untouched).
  ops.push(
    (async () => sb.from("upcoming_sessions").delete().eq("user_id", userId).like("title", "New lesson ·%"))(),
  );
  const results = await withTimeout(
    Promise.all(ops),
    NETWORK_TIMEOUT_MS,
    "revoke",
  );
  for (const r of results as Array<{ error?: { message: string } | null }>) {
    if (r?.error) throw r.error;
  }
}

export type PartViews = { sort_order: number; views: number; done: boolean };

/**
 * Per-part viewing sheet: one row per lesson with its own used/3 count.
 * This is what the admin sees and restarts — never a course-wide aggregate.
 */
export async function getUserVideoViews(userId: string, courseSlug: string): Promise<PartViews[]> {
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) return [];
  const [{ data: vids }, { data: views }] = await withTimeout(
    Promise.all([
      sb.from("videos").select("id,sort_order").eq("course_id", courseId).order("sort_order"),
      sb.from("video_views").select("video_id,views_count,done").eq("user_id", userId),
    ]),
    NETWORK_TIMEOUT_MS,
    "parts-summary",
  );
  const byId = new Map(
    ((views ?? []) as unknown as Array<{ video_id: string; views_count: number; done: boolean }>)
      .map((w) => [w.video_id, w] as const),
  );
  return ((vids ?? []) as unknown as Array<{ id: string; sort_order: number }>)
    .map((v) => {
      const w = byId.get(v.id);
      return {
        sort_order: v.sort_order,
        views: Math.min(3, Math.max(0, w?.views_count ?? 0)),
        done: w?.done ?? false,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Restart ONE part back to 3 of 3 WITHOUT touching anything else.
 * UPDATE (not delete) preserves the sticky unlock flag — every other part
 * keeps the exact open/closed state it had, and this part stays open too.
 * The student is notified automatically; the admin types nothing.
 * Admin-only via RLS. Idempotent.
 */
export async function resetUserVideo(userId: string, courseSlug: string, sortOrder: number): Promise<boolean> {
  if (!throttle(`reset-part-${userId}`, 3000)) throw new Error("too many attempts");
  const sb = authed();
  const { data: session } = await withTimeout(sb.auth.getSession(), NETWORK_TIMEOUT_MS, "session");
  if (!session.session) throw new Error("Admin session expired — log in again, then retry.");
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { data: vids } = await withTimeout(
    (async () => sb.from("videos").select("id,module_id").eq("course_id", courseId).eq("sort_order", sortOrder))(),
    NETWORK_TIMEOUT_MS,
    "video-lookup",
  );
  const rows = ((vids ?? []) as unknown as Array<{ id: string; module_id: string }>).filter((v) => v.id);
  if (rows.length === 0) throw new Error("This part has no video row yet — save the course from the editor first.");
  const ids = rows.map((v) => v.id);
  const { error } = await withTimeout(
    (async () =>
      sb.from("video_views").update({ views_count: 0, done: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId).in("video_id", ids))(),
    NETWORK_TIMEOUT_MS,
    "reset-part",
  );
  if (error) throw error;
  // Automatic student notice (best-effort; the reset itself already succeeded).
  try {
    let partTitle = `Part ${sortOrder + 1}`;
    try {
      const { data: mt } = await sb.from("module_translations")
        .select("title").eq("module_id", rows[0].module_id).eq("lang", "ar").limit(1).single();
      const t = (mt as unknown as { title: string } | null)?.title?.trim();
      if (t) partTitle = t;
    } catch {
      /* keep fallback */
    }
    await sb.from("notifications").insert({
      user_id: userId,
      title: "Views restarted · تم تصفير المشاهدات",
      message: `${partTitle} (${courseSlug}) — back to 3 of 3. / رجع 3 من 3.`,
    });
  } catch {
    /* notice is best-effort */
  }
  return true;
}

/**
 * Restart a user's viewing sheet for one course: deletes their per-video
 * progress rows, so every lesson returns to 3 of 3 views remaining.
 * Admin-only via RLS. Idempotent — no rows, no change.
 */
export type ResetResult = { deleted: number; total: number };

export async function resetUserViews(userId: string, courseSlug: string): Promise<ResetResult> {
  if (!throttle(`reset-views-${userId}`, 3000)) throw new Error("too many attempts");
  const sb = authed();
  // Fail loudly (not silently) when the admin session is gone: without it,
  // RLS hides every video row and the reset would no-op with "0 deleted".
  const { data: session } = await withTimeout(sb.auth.getSession(), NETWORK_TIMEOUT_MS, "session");
  if (!session.session) throw new Error("Admin session expired — log in again, then retry.");
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { data: vids } = await withTimeout(
    (async () => sb.from("videos").select("id").eq("course_id", courseId))(),
    NETWORK_TIMEOUT_MS,
    "video-lookup",
  );
  const ids = ((vids ?? []) as unknown as Array<{ id: string }>).map((v) => v.id);
  if (ids.length === 0) throw new Error("This course has no video rows yet — save it from the course editor first.");
  const { error, count } = await withTimeout(
    (async () =>
      sb.from("video_views").delete({ count: "exact" }).eq("user_id", userId).in("video_id", ids))(),
    NETWORK_TIMEOUT_MS,
    "reset-views",
  );
  if (error) throw error;
  return { deleted: count ?? 0, total: ids.length };
}

/**
 * Per-course watch summary for the admin card, in the user's own units:
 * views consumed out of the course allowance (each lesson × 3 views),
 * plus lessons finished. Lets the admin SEE the reset work.
 */
export type CourseViewsSummary = {
  done: number;
  total: number;
  viewsUsed: number;
  viewsTotal: number;
};

export async function getUserCourseViews(
  userId: string,
  courseSlug: string,
): Promise<CourseViewsSummary> {
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) return { done: 0, total: 0, viewsUsed: 0, viewsTotal: 0 };
  const [{ data: vids }, { data: views }] = await withTimeout(
    Promise.all([
      sb.from("videos").select("id").eq("course_id", courseId),
      sb.from("video_views").select("video_id,views_count,done").eq("user_id", userId),
    ]),
    NETWORK_TIMEOUT_MS,
    "views-summary",
  );
  const ids = new Set(((vids ?? []) as unknown as Array<{ id: string }>).map((v) => v.id));
  if (ids.size === 0) return { done: 0, total: 0, viewsUsed: 0, viewsTotal: 0 };
  const mine = ((views ?? []) as unknown as Array<{ video_id: string; views_count: number; done: boolean }>)
    .filter((w) => ids.has(w.video_id));
  const done = mine.filter((w) => w.done).length;
  const viewsUsed = mine.reduce((a, w) => a + Math.min(3, Math.max(0, w.views_count ?? 0)), 0);
  return { done, total: ids.size, viewsUsed, viewsTotal: ids.size * 3 };
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

/**
 * Manual general notification to one user (announcements, recommended
 * courses — anything not tied to a lesson). Admin-only via RLS.
 */
export async function sendNotification(userId: string, title: string, message: string): Promise<void> {
  if (!throttle(`notify-${userId}`, 3000)) throw new Error("too many attempts");
  const t = title.trim();
  if (!t) throw new Error("Title is required.");
  const sb = authed();
  const { error } = await withTimeout(
    (async () => sb.from("notifications").insert({ user_id: userId, title: t, message: message.trim() }))(),
    NETWORK_TIMEOUT_MS,
    "notify",
  );
  if (error) throw error;
}

/**
 * New-lesson broadcast: every user enrolled in the course gets one row in
 * the LESSONS widget (upcoming sessions) — never the general notifications.
 * Called after an admin save that ADDED videos (never on edits).
 */
export async function notifyNewLessons(
  courseSlug: string,
  lessons: Array<{ titleEn: string; titleAr: string }>,
): Promise<number> {
  if (lessons.length === 0) return 0;
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) return 0;
  const { data: enr } = await withTimeout(
    (async () => sb.from("enrollments").select("user_id").eq("course_id", courseId))(),
    NETWORK_TIMEOUT_MS,
    "enrollment-list",
  );
  const userIds = ((enr ?? []) as unknown as Array<{ user_id: string }>).map((r) => r.user_id);
  if (userIds.length === 0) return 0;
  const titles = lessons.map((l) => l.titleEn || l.titleAr || "New lesson").join("، ");
  const now = new Date().toISOString();
  const rows = userIds.map((user_id) => ({
    user_id,
    title: `New lesson · درس جديد: ${titles}`,
    date: now,
  }));
  const { error } = await withTimeout(
    (async () => sb.from("upcoming_sessions").insert(rows))(),
    NETWORK_TIMEOUT_MS,
    "notify-broadcast",
  );
  if (error) throw error;
  return userIds.length;
}

/**
 * Trigger-first lesson notices with client fallback, sessions widget ONLY.
 * The DB trigger (trg_notify_enrolled_on_new_video) already inserts one row
 * per (enrolled user × new lesson) synchronously inside the save — this
 * verifies those rows landed and inserts ONLY the gaps (missing trigger,
 * partial failure). Never duplicates, never touches general notifications.
 * Returns total covered students.
 */
export async function ensureLessonNotices(
  courseSlug: string,
  lessons: Array<{ titleEn: string; titleAr: string }>,
  sinceIso: string,
): Promise<number> {
  if (lessons.length === 0) return 0;
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) return 0;
  const { data: enr } = await withTimeout(
    (async () => sb.from("enrollments").select("user_id").eq("course_id", courseId))(),
    NETWORK_TIMEOUT_MS,
    "enrollment-list",
  );
  const userIds = ((enr ?? []) as unknown as Array<{ user_id: string }>).map((r) => r.user_id);
  if (userIds.length === 0) return 0;
  // Same title shape as the trigger: ar-first, trimmed, fallback literal.
  const want = lessons.map(
    (l) => `New lesson · درس جديد: ${(l.titleAr || "").trim() || (l.titleEn || "").trim() || "New lesson"}`,
  );
  const { data: rows } = await withTimeout(
    (async () => sb.from("upcoming_sessions").select("user_id,title,date")
      .in("user_id", userIds).in("title", want))(),
    NETWORK_TIMEOUT_MS,
    "notice-check",
  );
  const covered = new Set(
    ((rows ?? []) as unknown as Array<{ user_id: string; title: string; date: string }>)
      .filter((r) => r.date >= sinceIso)
      .map((r) => r.user_id),
  );
  const missing = userIds.filter((u) => !covered.has(u));
  if (missing.length > 0) {
    const stamp = new Date().toISOString();
    const inserts = missing.flatMap((user_id) => want.map((title) => ({ user_id, title, date: stamp })));
    const { error } = await withTimeout(
      (async () => sb.from("upcoming_sessions").insert(inserts))(),
      NETWORK_TIMEOUT_MS,
      "notice-fill",
    );
    if (error) throw error;
    missing.forEach((u) => covered.add(u));
  }
  return covered.size;
}

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
 * Full wipe: sessions + notifications (keyed to auth.users, so no cascade
 * from profiles) are deleted explicitly, then the profile row goes —
 * cascading tracks, enrollments, views, and exam results server-side.
 * The student ends with zero rows anywhere: re-adding them starts fresh.
 * NOTE: the Supabase Auth account itself can only be deleted from the
 * dashboard or with the service-role key — without a profile the account
 * cannot sign in to anything (session restore fails closed). For a fully
 * fresh identity (new password), delete the auth user in the dashboard too
 * or re-register with a new email.
 */
export async function deleteProfile(userId: string): Promise<void> {
  const sb = authed();
  const wipes = await withTimeout(
    Promise.all([
      (async () => sb.from("upcoming_sessions").delete().eq("user_id", userId))(),
      (async () => sb.from("notifications").delete().eq("user_id", userId))(),
    ]),
    NETWORK_TIMEOUT_MS,
    "delete-activity",
  );
  for (const r of wipes as Array<{ error?: { message: string } | null }>) {
    if (r?.error) throw r.error;
  }
  const { error } = await withTimeout(
    (async () => sb.from("profiles").delete().eq("id", userId))(),
    NETWORK_TIMEOUT_MS,
    "delete-user",
  );
  if (error) throw error;
}

/**
 * One-click pipeline test: writes a single lesson notice for the newest
 * video straight into the student's sessions widget — the exact shape the
 * trigger + save-flow produce. If the student sees it after refresh, the
 * pipeline (RLS, enrollment, widget query) is fine and the problem is in
 * the save flow; if not, the pipeline itself is broken. Throws with reason.
 */
export async function sendLessonNotice(userId: string, courseSlug: string): Promise<string> {
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", courseSlug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) throw new Error("course not found");
  const { data: vids } = await withTimeout(
    (async () => sb.from("videos").select("module_id").eq("course_id", courseId)
      .order("sort_order", { ascending: false }).limit(1))(),
    NETWORK_TIMEOUT_MS,
    "video-lookup",
  );
  const row = ((vids ?? []) as unknown as Array<{ module_id: string }>)[0];
  if (!row) throw new Error("course has no videos");
  const { data: trs } = await withTimeout(
    (async () => sb.from("module_translations").select("lang,title").eq("module_id", row.module_id))(),
    NETWORK_TIMEOUT_MS,
    "title-lookup",
  );
  const list = ((trs ?? []) as unknown as Array<{ lang: string; title: string }>);
  const name = list.find((t) => t.lang === "ar")?.title?.trim()
    || list.find((t) => t.lang === "en")?.title?.trim()
    || "New lesson";
  const title = `New lesson · درس جديد: ${name}`;
  const { error } = await withTimeout(
    (async () => sb.from("upcoming_sessions").insert({ user_id: userId, title, date: new Date().toISOString() }))(),
    NETWORK_TIMEOUT_MS,
    "notice-test",
  );
  if (error) throw error;
  return title;
}
