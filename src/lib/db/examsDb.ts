import { supabase } from "./client";
import { NETWORK_TIMEOUT_MS, throttle, withTimeout } from "./throttle";

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

function colFor(kind: ExamKind): string {
  return kind === "exam" ? "exam_json" : "assign_json";
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

/** Structured exam/assignment content, or null when the lesson has none. */
export async function getExam(videoId: string, kind: ExamKind): Promise<ExamContent | null> {
  const sb = authed();
  const col = colFor(kind);
  const { data, error } = await withTimeout(
    (async () => sb.from("videos").select(`id,${col}`).eq("id", videoId).single())(),
    NETWORK_TIMEOUT_MS,
    "exam-load",
  );
  if (error || !data) return null;
  const raw = (data as unknown as Record<string, ExamContent | null>)[col];
  if (!raw || !Array.isArray(raw.questions) || raw.questions.length === 0) return null;
  return {
    title: raw.title ?? "",
    questions: raw.questions
      .filter((q) => q && typeof q.prompt === "string" && q.prompt.trim() !== "")
      .map((q) => ({
        id: String(q.id ?? Math.random().toString(36)),
        kind: q.kind === "writing" ? "writing" : "choice",
        prompt: q.prompt,
        choices: Array.isArray(q.choices) ? q.choices : [],
        correct: typeof q.correct === "number" ? q.correct : null,
      })),
  };
}

/** Admin: replace a lesson's exam/assignment content. */
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
    (async () => sb.from("videos").update({ [colFor(kind)]: clean }).eq("id", videoId))(),
    NETWORK_TIMEOUT_MS,
    "exam-save",
  );
  if (error) throw error;
}

export async function getMyResult(videoId: string, kind: ExamKind): Promise<ExamResult | null> {
  const sb = authed();
  const { data: session } = await sb.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const { data, error } = await withTimeout(
    (async () => sb.from("exam_results").select("*").eq("user_id", uid).eq("video_id", videoId).eq("kind", kind).limit(1).maybeSingle())(),
    NETWORK_TIMEOUT_MS,
    "result-load",
  );
  if (error || !data) return null;
  const r = data as unknown as ExamResult;
  return {
    answers: r.answers ?? {},
    choice_score: r.choice_score ?? 0,
    choice_total: r.choice_total ?? 0,
    writing_score: r.writing_score ?? null,
    writing_total: r.writing_total ?? 0,
    status: r.status === "graded" ? "graded" : "pending",
  };
}

/**
 * Student submit: choice questions score instantly; any writing question
 * leaves the attempt pending for instructor grading.
 */
export async function submitAttempt(
  videoId: string,
  kind: ExamKind,
  content: ExamContent,
  answers: Record<string, number | string>,
): Promise<ExamResult> {
  if (!throttle(`exam-submit-${videoId}`, 3000)) throw new Error("too many attempts");
  const sb = authed();
  const { data: session } = await sb.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("not signed in");
  const existing = await getMyResult(videoId, kind);
  if (existing?.status === "graded") throw new Error("Already graded — contact your instructor to retry.");
  let choice_score = 0;
  let choice_total = 0;
  let writing_total = 0;
  for (const q of content.questions) {
    if (q.kind === "choice") {
      choice_total += 1;
      if (typeof answers[q.id] === "number" && answers[q.id] === q.correct) choice_score += 1;
    } else {
      writing_total += 1;
    }
  }
  const status = writing_total > 0 ? "pending" : "graded";
  const row = {
    user_id: uid,
    video_id: videoId,
    kind,
    answers,
    choice_score,
    choice_total,
    writing_score: null,
    writing_total,
    status,
    updated_at: new Date().toISOString(),
  };
  const { error } = await withTimeout(
    (async () => sb.from("exam_results").upsert(row, { onConflict: "user_id,video_id,kind" }))(),
    NETWORK_TIMEOUT_MS,
    "attempt-submit",
  );
  if (error) throw error;
  return { answers, choice_score, choice_total, writing_score: null, writing_total, status };
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
        .select("exam_json,assign_json,courses!inner(slug)").eq("id", r.video_id).single();
      const vv = v as unknown as {
        exam_json: ExamContent | null; assign_json: ExamContent | null;
        courses: { slug: string } | Array<{ slug: string }>;
      } | null;
      const cs = vv?.courses;
      course_slug = Array.isArray(cs) ? cs[0]?.slug ?? "" : cs?.slug ?? "";
      exam = r.kind === "exam" ? vv?.exam_json ?? null : vv?.assign_json ?? null;
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
 * Instructor grades the writing questions (correct/incorrect each).
 * Flips the attempt to graded and notifies the student.
 */
export async function gradeAttempt(
  userId: string,
  videoId: string,
  kind: ExamKind,
  marks: Record<string, boolean>,
): Promise<void> {
  const sb = authed();
  const score = Object.values(marks).filter(Boolean).length;
  const { error } = await withTimeout(
    (async () =>
      sb.from("exam_results").update({ writing_score: score, status: "graded", updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("video_id", videoId).eq("kind", kind))(),
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
