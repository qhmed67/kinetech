import { supabase } from "../supabase";

export type ExamKind = "exam" | "assignment";

export interface LessonWork {
  videoId: string;
  title: string;
  exam?: {
    state: "pending" | "graded";
    score?: number;
    total?: number;
    submitted_at?: string;
    graded_at?: string;
  };
  assign?: {
    state: "pending" | "graded";
    score?: number;
    total?: number;
    submitted_at?: string;
    graded_at?: string;
  };
}

export async function getCourseWork(courseSlug: string, lang: "en" | "ar"): Promise<LessonWork[]> {
  const { data, error } = await supabase
    .from("course_parts")
    .select(`
      video_id,
      sort_order,
      title,
      exams: course_exams (
        state,
        score,
        total,
        submitted_at,
        graded_at
      ),
      assignments: course_assignments (
        state,
        score,
        total,
        submitted_at,
        graded_at
      )
    `)
    .eq("course_slug", courseSlug)
    .order("sort_order");

  if (error) {
    console.error("Error fetching course work:", error);
    return [];
  }

  return data.map((part) => ({
    videoId: part.video_id,
    title: part.title[lang] || part.title.en,
    exam: part.exams[0] || undefined,
    assign: part.assignments[0] || undefined,
  }));
}