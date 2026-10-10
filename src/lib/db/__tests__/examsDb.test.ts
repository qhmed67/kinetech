import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  supabase: vi.fn(),
}));

vi.mock("../throttle", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../throttle")>();
  return {
    ...mod,
    throttle: () => true,
    withTimeout: <T>(p: Promise<T>) => p,
  };
});

import { supabase } from "../client";
import { getExam, submitAttempt } from "../examsDb";

const mockedSupabase = vi.mocked(supabase);

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "limit", "maybeSingle", "insert", "update", "upsert", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as { then: unknown }).then =
    (Promise.resolve(result) as Promise<unknown> as { then: unknown }).then.bind(Promise.resolve(result));
  return chain;
}

const session = {
  auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } }) },
};

const content = {
  title: "Quiz",
  questions: [
    { id: "q1", kind: "choice", prompt: "2+2?", choices: ["3", "4"], correct: 1 },
    { id: "q2", kind: "writing", prompt: "Explain.", choices: [], correct: null },
  ],
} as const;

describe("getExam", () => {
  it("returns null when the lesson has no structured content", async () => {
    const sb = { ...session, from: vi.fn(() => query({ data: { id: "v", exam_json: { title: "", questions: [] } }, error: null })) };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(getExam("v", "exam")).resolves.toBeNull();
  });

  it("sanitizes rows into typed content", async () => {
    const sb = { ...session, from: vi.fn(() => query({ data: { id: "v", exam_json: content }, error: null })) };
    mockedSupabase.mockReturnValue(sb as never);
    const c = await getExam("v", "exam");
    expect(c?.questions).toHaveLength(2);
    expect(c?.questions[0]).toMatchObject({ kind: "choice", correct: 1 });
  });
});

describe("submitAttempt", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("scores choices instantly and pends on writing", async () => {
    const upsert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = {
      ...session,
      from: vi.fn((table: string) => {
        if (table === "exam_results" && (upsert.mock.calls.length === 0 || true)) {
          // first call in submitAttempt is getMyResult (select), second is upsert
          return { ...query({ data: null, error: null }), upsert };
        }
        return query({ data: null, error: null });
      }),
    };
    // getMyResult: select chain resolves null data
    mockedSupabase.mockReturnValue(sb as never);
    const r = await submitAttempt("v", "exam", { ...content, questions: [...content.questions] }, { q1: 1, q2: "essay" });
    expect(r.choice_score).toBe(1);
    expect(r.choice_total).toBe(1);
    expect(r.status).toBe("pending");
    expect(r.writing_total).toBe(1);
  });

  it("grades immediately when no writing questions exist", async () => {
    const sb = {
      ...session,
      from: vi.fn(() => query({ data: null, error: null })),
    };
    mockedSupabase.mockReturnValue(sb as never);
    const onlyChoice = { title: "Q", questions: [content.questions[0]] };
    const r = await submitAttempt("v", "exam", JSON.parse(JSON.stringify(onlyChoice)), { q1: 0 });
    expect(r.status).toBe("graded");
    expect(r.choice_score).toBe(0);
  });

  it("refuses to overwrite a graded attempt", async () => {
    const sb = {
      ...session,
      from: vi.fn(() => query({
        data: { answers: {}, choice_score: 1, choice_total: 1, writing_score: null, writing_total: 0, status: "graded" },
        error: null,
      })),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(
      submitAttempt("v", "exam", JSON.parse(JSON.stringify(content)), { q1: 1 }),
    ).rejects.toThrow("Already graded");
  });
});
