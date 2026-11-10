import { supabase } from "./client";
import { NETWORK_TIMEOUT_MS, throttle, withTimeout } from "./throttle";
import { getWatchStateDb } from "./watchDb";

export type ExamKind = "exam" | "assignment";

export type ExamQuestion = {
  id: string;
  kind: "choice" | "writing";
  prompt: string;
  /** choice only; writing ignores */
  choices: string[];
  /** choice only: index into choices; writing always null */
  correct: number | null;
};

export type ExamContent = {
  title: string;
  questions: ExamQuestion[];
};

export type ExamResult = {
  answers: Record<string, number | string>;
  choice_score: number;
  choice_total: number;
  writing_score: number | null;
  writing_total: number;
  status: "graded" | "pending";
  feedback: Record<string, string>;
};

/** Per-question review marks, computed SERVER-side from the answer key.
    correctIndex is present ONLY for graded (final) attempts — pending
    results and resubmits never see the key. */
export type AttemptReview = {
  id: string;
  picked: number | string | null;
  right: boolean | null;
  correctIndex: number | null;
};

export type MyAttempt = {
  result: ExamResult | null;
  questions: ExamContent;
  review: AttemptReview[] | null;
};

export const emptyExam = (): ExamContent => ({ title: "", questions: [] });

export function newQuestion(kind: "choice" | "writing"): ExamQuestion {
  return {
    id: `q${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    kind,
    prompt: "",
    choices: kind === "choice" ? ["", "", "", ""] : [],
    correct: kind === "choice" ? 0 : null,
  };
}

function authed() {
  const sb = supabase();
  if (!sb) throw new Error("supabase-not-configured");
  return sb;
}

/** Resolve the DB video id for a course lesson (needed for exam storage). */
export async function videoIdBySlug(slug: string, sortOrder: number): Promise<string | null> {
  const sb = authed();
  const { data } = await withTimeout(
    (async () =>
      sb.from("videos").select("id,courses!inner(slug)").eq("courses.slug", slug).eq("sort_order", sortOrder).limit(1)
        .single())(),
    NETWORK_TIMEOUT_MS,
    "video-lookup",
  ).catch(() => ({ data: null }) as const);
  return (data as unknown as { id: string } | null)?.id ?? null;
}

function normalizeContent(raw: unknown): ExamContent {
  const r = raw as { title?: unknown; questions?: unknown } | null;
  const list = Array.isArray(r?.questions) ? r.questions : [];
  return {
    title: typeof r?.title === "string" ? r.title : "",
    questions: (list as Array<Record<string, unknown>>)
      .filter((q) => q && typeof q.prompt === "string" && (q.prompt as string).trim() !== "")
      .map((q) => ({
        id: String(q.id ?? Math.random().toString(36)),
        kind: q.kind === "writing" ? "writing" : "choice",
        prompt: q.prompt as string,
        choices: Array.isArray(q.choices) ? (q.choices as unknown[]).map(String) : [],
        // Student paths always receive null here (key lives server-side).
        correct: typeof q.correct === "number" ? q.correct : null,
      })),
  };
}

function hasQuestions(c: ExamContent | null): boolean {
  return !!c && Array.isArray(c.questions) && c.questions.length > 0;
}

/** Student content via RPC — questions WITHOUT correct indices. */
export async function getExam(videoId: string, kind: ExamKind): Promise<ExamContent | null> {
  const sb = authed();
  const { data, error } = await withTimeout(
    (async () => sb.rpc("get_exam", { p_video: videoId, p_kind: kind }))(),
    NETWORK_TIMEOUT_MS,
    "exam-load",
  );
  if (error || !data) return null;
  const c = normalizeContent(data);
  return hasQuestions(c) ? c : null;
}

/** Admin content WITH the answer key (merged client-side from key map). */
export async function getExamAdmin(videoId: string, kind: ExamKind): Promise<ExamContent | null> {
  const sb = authed();
  const { data, error } = await withTimeout(
    (async () => sb.rpc("get_exam_admin", { p_video: videoId, p_kind: kind }))(),
    NETWORK_TIMEOUT_MS,
    "exam-admin-load",
  );
  if (error || !data) return null;
  const row = data as { content?: unknown; key?: Record<string, number> };
  const c = normalizeContent(row.content);
  if (!hasQuestions(c)) return null;
  const key = row.key ?? {};
  return {
    ...c,
    questions: c.questions.map((q) => ({
      ...q,
      correct: q.kind === "choice" && typeof key[q.id] === "number" ? key[q.id] : null,
    })),
  };
}

/** Admin: replace a lesson's exam/assignment content (key splits server-side). */
export async function saveExam(videoId: string, kind: ExamKind, content: ExamContent): Promise<void> {
  if (!throttle(`exam-save-${videoId}`, 3000)) throw new Error("too many attempts");
  const sb = authed();
  const clean: ExamContent = {
    title: content.title.trim(),
    questions: content.questions
      .filter((q) => q.prompt.trim() !== "")
      .map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt.trim(),
        choices: q.kind === "choice" ? q.choices.map((c) => c.trim()) : [],
        correct: q.kind === "choice" && q.correct !== null ? Math.max(0, q.correct) : null,
      })),
  };
  const { error } = await withTimeout(
    (async () => sb.rpc("save_exam", { p_video: videoId, p_kind: kind, p_content: clean }))(),
    NETWORK_TIMEOUT_MS,
    "exam-save",
  );
  if (error) throw error;
}

function normalizeReview(raw: unknown): AttemptReview[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    picked: typeof r.picked === "number" || typeof r.picked === "string" ? (r.picked as number | string) : null,
    right: typeof r.right === "boolean" ? r.right : null,
    correctIndex: typeof r.correctIndex === "number" ? r.correctIndex : null,
  }));
}

function normalizeResult(raw: unknown): ExamResult | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  return {
    answers: (r.answers ?? {}) as Record<string, number | string>,
    choice_score: typeof r.choice_score === "number" ? r.choice_score : 0,
    choice_total: typeof r.choice_total === "number" ? r.choice_total : 0,
    writing_score: typeof r.writing_score === "number" ? r.writing_score : null,
    writing_total: typeof r.writing_total === "number" ? r.writing_total : 0,
    status: r.status === "graded" ? "graded" : "pending",
    feedback: (r.feedback ?? {}) as Record<string, string>,
  };
}

/**
 * Attempt + questions + review in one gated RPC call. Review reveals
 * correct indices ONLY for graded (final) attempts — pending shows picks.
 */
export async function getMyResult(videoId: string, kind: ExamKind): Promise<MyAttempt | null> {
  const sb = authed();
  const { data, error } = await withTimeout(
    (async () => sb.rpc("get_my_result", { p_video: videoId, p_kind: kind }))(),
    NETWORK_TIMEOUT_MS,
    "result-load",
  );
  if (error || !data) return null;
  const row = data as { result?: unknown; questions?: unknown; review?: unknown };
  return {
    result: normalizeResult(row.result),
    questions: normalizeContent(row.questions),
    review: normalizeReview(row.review),
  };
}

/**
 * Student submit: scored SERVER-side from the answer key. Choice-only work
 * grades instantly; any writing question leaves the attempt pending.
 * Graded rows reject resubmits; pending rows resubmit key-free.
 */
export async function submitAttempt(
  videoId: string,
  kind: ExamKind,
  answers: Record<string, number | string>,
): Promise<{ result: ExamResult; review: AttemptReview[] | null }> {
  if (!throttle(`exam-submit-${videoId}`, 3000)) throw new Error("too many attempts");
  const sb = authed();
  const { data, error } = await withTimeout(
    (async () => sb.rpc("submit_exam", { p_video: videoId, p_kind: kind, p_answers: answers }))(),
    NETWORK_TIMEOUT_MS,
    "attempt-submit",
  );
  if (error) throw error;
  const row = (data ?? {}) as { result?: unknown; review?: unknown };
  const result = normalizeResult(row.result);
  if (!result) throw new Error("submit failed");
  return { result, review: normalizeReview(row.review) };
}

export type WorkItemState =
  | { state: "todo" }
  | { state: "pending" }
  | { state: "graded"; score: number; total: number };

export type LessonWork = {
  sort_order: number;
  title: string;
  exam: WorkItemState | null;
  assign: WorkItemState | null;
};

/**
 * Per-lesson exam/assignment status for one course: which lessons actually
 * have structured work, and for each, whether the student should solve it,
 * wait for review, or open the graded review. Drives the dashboard tabs.
 */
export async function getCourseWorkStatus(
  slug: string,
  lang: "en" | "ar",
): Promise<LessonWork[]> {
  const sb = authed();
  const { data: course } = await withTimeout(
    (async () => sb.from("courses").select("id").eq("slug", slug).single())(),
    NETWORK_TIMEOUT_MS,
    "course-lookup",
  );
  const courseId = (course as unknown as { id: string } | null)?.id;
  if (!courseId) return [];
  const { data: session } = await sb.auth.getSession();
  const uid = session.session?.user.id ?? null;
  const [modsRes, vidsRes, resRes, presRes] = await withTimeout(
    Promise.all([
      sb.from("modules").select("id,sort_order,module_translations(lang,title)").eq("course_id", courseId).order("sort_order"),
      sb.from("videos").select("id,module_id,sort_order").eq("course_id", courseId).order("sort_order"),
      uid
        ? sb.from("exam_results").select("video_id,kind,choice_score,choice_total,writing_score,writing_total,status").eq("user_id", uid)
        : Promise.resolve({ data: [] as unknown[] }),
      sb.rpc("course_exam_presence", { p_course: courseId }),
    ]),
    NETWORK_TIMEOUT_MS,
    "work-status",
  );
  // Unlock gating: an exam surfaces only once its lesson is actually open
  // for this student — never before first open.
  let unlockedSet: Set<number> | null = null;
  try {
    const ws = await getWatchStateDb(slug, lang);
    unlockedSet = new Set(ws.filter((r) => r.unlocked).map((r) => r.sort_order));
  } catch {
    /* offline/denied — fall back to showing all (existing behavior) */
  }
  const mods = ((modsRes as unknown as { data: unknown }).data ?? []) as unknown as Array<{
    id: string; sort_order: number;
    module_translations: Array<{ lang: string; title: string }>;
  }>;
  const vids = ((vidsRes as unknown as { data: unknown }).data ?? []) as unknown as Array<{
    id: string; module_id: string; sort_order: number;
  }>;
  const pres = (((presRes as unknown as { data: unknown }).data ?? []) as unknown as Array<{
    video_id: string; has_exam: boolean; has_assignment: boolean;
  }>);
  const hasExam = new Map(pres.map((p) => [p.video_id, p]));
  const results = ((resRes as unknown as { data: unknown }).data ?? []) as unknown as Array<{
    video_id: string; kind: string;
    choice_score: number; choice_total: number;
    writing_score: number | null; writing_total: number;
    status: string;
  }>;
  const hasQuestions = (videoId: string, kind: ExamKind): boolean => {
    const p = hasExam.get(videoId);
    if (!p) return false;
    return kind === "exam" ? p.has_exam : p.has_assignment;
  };

  return vids
    .filter((v) => unlockedSet === null || unlockedSet.has(v.sort_order))
    .map((v) => {
    const mod = mods.find((m) => m.id === v.module_id);
    const tr = mod?.module_translations.find((t) => t.lang === lang)
      ?? mod?.module_translations.find((t) => t.title?.trim());
    const stateFor = (kind: ExamKind, present: boolean): WorkItemState | null => {
      if (!present) return null;
      const r = results.find((x) => x.video_id === v.id && x.kind === kind);
      if (!r) return { state: "todo" };
      if (r.status === "graded") {
        return {
          state: "graded",
          score: (r.choice_score ?? 0) + (r.writing_score ?? 0),
          total: (r.choice_total ?? 0) + (r.writing_total ?? 0),
        };
      }
      return { state: "pending" };
    };
    return {
      sort_order: v.sort_order,
      title: tr?.title ?? `Part ${v.sort_order + 1}`,
      exam: stateFor("exam", hasQuestions(v.id, "exam")),
      assign: stateFor("assignment", hasQuestions(v.id, "assignment")),
    };
    });
}

export type PendingGrading = {
  user_id: string;
  email: string;
  video_id: string;
  course_slug: string;
  kind: ExamKind;
  answers: Record<string, number | string>;
  choice_score: number;
  choice_total: number;
  writing_total: number;
  updated_at: string;
  exam: ExamContent | null;
};

/** Admin queue: every attempt waiting on writing grades, with context. */
export async function listPendingGrading(): Promise<PendingGrading[]> {
  const sb = authed();
  const { data, error } = await withTimeout(
    (async () =>
      sb.from("exam_results").select("user_id,video_id,kind,answers,choice_score,choice_total,writing_total,updated_at,profiles!inner(email)")
        .eq("status", "pending").order("updated_at"))(),
    NETWORK_TIMEOUT_MS,
    "grading-queue",
  );
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    user_id: string; video_id: string; kind: ExamKind;
    answers: Record<string, number | string>;
    choice_score: number; choice_total: number; writing_total: number;
    updated_at: string; profiles: { email: string } | Array<{ email: string }>;
  }>;
  const out: PendingGrading[] = [];
  for (const r of rows) {
    const email = Array.isArray(r.profiles) ? r.profiles[0]?.email ?? "" : r.profiles.email;
    let course_slug = "";
    let exam: ExamContent | null = null;
    try {
      const { data: v } = await sb.from("videos")
        .select("courses!inner(slug)").eq("id", r.video_id).single();
      const vv = v as unknown as {
        courses: { slug: string } | Array<{ slug: string }>;
      } | null;
      const cs = vv?.courses;
      course_slug = Array.isArray(cs) ? cs[0]?.slug ?? "" : cs?.slug ?? "";
      // Admin key view (direct exam_json reads are revoked for clients).
      exam = await getExamAdmin(r.video_id, r.kind).catch(() => null);
    } catch {
      /* context optional */
    }
    out.push({
      user_id: r.user_id, email, video_id: r.video_id, course_slug,
      kind: r.kind, answers: r.answers ?? {}, choice_score: r.choice_score ?? 0,
      choice_total: r.choice_total ?? 0, writing_total: r.writing_total ?? 0,
      updated_at: r.updated_at, exam,
    });
  }
  return out;
}

/**
 * Instructor grades the writing questions (correct/incorrect each, optional
 * per-question note — e.g. the right answer when the student is wrong).
 * Flips the attempt to graded and notifies the student, who then reviews
 * everything (right/wrong per question) on the exam review page.
 */
export async function gradeAttempt(
  userId: string,
  videoId: string,
  kind: ExamKind,
  marks: Record<string, boolean>,
  notes: Record<string, string> = {},
): Promise<void> {
  const sb = authed();
  const score = Object.values(marks).filter(Boolean).length;
  const feedback: Record<string, string> = {};
  for (const [qid, note] of Object.entries(notes)) {
    if (note.trim() !== "") feedback[qid] = note.trim();
  }
  // Server-side grading (direct exam_results writes are revoked for clients).
  const { error } = await withTimeout(
    (async () => sb.rpc("grade_writing", {
      p_user: userId, p_video: videoId, p_kind: kind, p_score: score, p_notes: feedback,
    }))(),
    NETWORK_TIMEOUT_MS,
    "grade-save",
  );
  if (error) throw error;
  try {
    await sb.from("notifications").insert({
      user_id: userId,
      title: "Exam graded · تم التصحيح",
      message: "Your writing answers were reviewed — check your result. / تم مراجعة إجاباتك — شوف نتيجتك.",
    });
  } catch {
    /* grading stands even if the ping fails */
  }
}
