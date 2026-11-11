/* Web examsDb student-side port (apps/web/src/lib/db/examsDb.ts).
 * Questions, scoring, and review marks all come from the server via RPC —
 * the answer key never reaches the client (PRODUCT-RULES). Review reveals
 * correct options only for graded/final attempts. */

import { getSupabase } from "../supabase";
import { NETWORK_TIMEOUT_MS, throttle, withTimeout } from "./throttle";
import { getWatchState } from "./watch";

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

export const emptyExam = (): ExamContent => ({
  title: "",
  questions: [
    {
      id: "q1",
      kind: "choice",
      prompt: "",
      choices: ["", "", "", ""],
      correct: null,
    },
  ],
});

function authed() {
  const sb = getSupabase();
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
    const ws = await getWatchState(slug, lang);
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
