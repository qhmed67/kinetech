import { describe, expect, it } from "vitest";
import { groupByCourse } from "../Grading";
import type { PendingGrading } from "../../lib/db/examsDb";

const row = (slug: string, id: string): PendingGrading => ({
  user_id: "u",
  email: "a@b.c",
  video_id: id,
  course_slug: slug,
  kind: "exam",
  answers: {},
  choice_score: 0,
  choice_total: 0,
  writing_total: 1,
  updated_at: "",
  exam: null,
});

describe("groupByCourse", () => {
  it("groups by course preserving first-seen order", () => {
    const groups = groupByCourse([row("b", "1"), row("a", "2"), row("b", "3")]);
    expect(groups.map((g) => g.slug)).toEqual(["b", "a"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("buckets empty slugs", () => {
    const groups = groupByCourse([row("", "1")]);
    expect(groups).toEqual([{ slug: "—", items: [row("", "1")] }]);
  });
});
