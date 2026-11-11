import { getSupabase } from "../supabase";

export type ExamKind = "exam" | "assignment";

export interface WorkState {
  state: "pending" | "graded";
  score?: number;
  total?: number;
  submitted_at?: string;
  graded_at?: string;
}

export interface LessonWork {
  videoId: string;
  title: string;
  exam?: WorkState;
  assign?: WorkState;
}

function l(obj: any, lang: "en" | "ar"): string {
  if (!obj) return "";
  return obj[lang] || obj.en || "";
}

function mapState(row: any | undefined | null): WorkState | undefined {
  if (!row) return undefined;
  return {
    state: row.state === "graded" ? "graded" : "pending",
    score: row.score ?? undefined,
    total: row.total ?? undefined,
    submitted_at: row.submitted_at ?? undefined,
    graded_at: row.graded_at ?? undefined,
  };
}

export async function getCourseWork(
  courseSlug: string,
  lang: "en" | "ar",
): Promise<LessonWork[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("supabase-not-configured");

  const { data, error } = await sb
    .from("course_parts")
    .select(
      "video_id, sort_order, title, exams:course_exams(state,score,total,submitted_at,graded_at), assignments:course_assignments(state,score,total,submitted_at,graded_at)",
    )
    .eq("course_slug", courseSlug)
    .order("sort_order");

  if (error) throw error;

  return (data ?? []).map((part: any) => ({
    videoId: part.video_id,
    title: l(part.title, lang),
    exam: mapState(part.exams?.[0]),
    assign: mapState(part.assignments?.[0]),
  }));
}
