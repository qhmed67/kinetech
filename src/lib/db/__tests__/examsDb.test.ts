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
import {
  getExam,
  getExamAdmin,
  getMyResult,
  gradeAttempt,
  listPendingGrading,
  saveExam,
  submitAttempt,
} from "../examsDb";

const mockedSupabase = vi.mocked(supabase);

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "limit", "maybeSingle", "insert", "update", "upsert", "order", "rpc"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as { then: unknown }).then =
    (Promise.resolve(result) as Promise<unknown> as { then: unknown }).then.bind(Promise.resolve(result));
  return chain;
}

const stripped = {
  title: "Quiz",
  questions: [
    { id: "q1", kind: "choice", prompt: "2+2?", choices: ["3", "4"], correct: null },
    { id: "q2", kind: "writing", prompt: "Explain.", choices: [], correct: null },
  ],
};

function rpcMock(impl: (fn: string, args: unknown) => unknown) {
  return {
    rpc: vi.fn((fn: string, args: unknown) => query(impl(fn, args))),
    from: vi.fn(() => query({ data: null, error: null })),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } }) },
  };
}

beforeEach(() => {
  mockedSupabase.mockReturnValue(null);
});

describe("getExam (student path)", () => {
  it("returns null when the lesson has no structured content", async () => {
    const sb = rpcMock(() => ({ data: null, error: null }));
    mockedSupabase.mockReturnValue(sb as never);
    await expect(getExam("v", "exam")).resolves.toBeNull();
  });

  it("never exposes correct indices", async () => {
    const sb = rpcMock((fn) => {
      if (fn === "get_exam") return { data: JSON.parse(JSON.stringify(stripped)), error: null };
      return { data: null, error: null };
    });
    mockedSupabase.mockReturnValue(sb as never);
    const c = await getExam("v", "exam");
    expect(c?.questions).toHaveLength(2);
    expect(c?.questions.every((q) => q.correct === null)).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/"correct":\d/);
  });

  it("never selects the exam tables directly", async () => {
    const sb = rpcMock(() => ({ data: JSON.parse(JSON.stringify(stripped)), error: null }));
    mockedSupabase.mockReturnValue(sb as never);
    await getExam("v", "exam");
    const tables = (sb.from as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).not.toContain("videos");
    expect(tables).not.toContain("exam_keys");
  });
});

describe("getExamAdmin", () => {
  it("merges the server key back into questions", async () => {
    const sb = rpcMock((fn) => {
      if (fn === "get_exam_admin") {
        return { data: { content: JSON.parse(JSON.stringify(stripped)), key: { q1: 1 } }, error: null };
      }
      return { data: null, error: null };
    });
    mockedSupabase.mockReturnValue(sb as never);
    const c = await getExamAdmin("v", "exam");
    expect(c?.questions[0]).toMatchObject({ correct: 1 });
    expect(c?.questions[1]).toMatchObject({ correct: null });
  });
});

describe("saveExam", () => {
  it("writes through the admin RPC, never direct table updates", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = {
      rpc,
      from: vi.fn(() => query({ data: null, error: null })),
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "a1" } } } }) },
    };
    mockedSupabase.mockReturnValue(sb as never);
    await saveExam("v", "exam", {
      title: "Q",
      questions: [{ id: "q1", kind: "choice", prompt: "2+2?", choices: ["3", "4"], correct: 1 }],
    });
    expect(rpc).toHaveBeenCalledWith(
      "save_exam",
      expect.objectContaining({ p_video: "v", p_kind: "exam" }),
    );
    const tables = (sb.from as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).not.toContain("videos");
  });
});

describe("submitAttempt (server grading)", () => {
  const attempt = {
    result: {
      answers: { q1: 1 }, choice_score: 1, choice_total: 1,
      writing_score: null, writing_total: 0, status: "graded", feedback: {},
    },
    review: [{ id: "q1", picked: 1, right: true, correctIndex: 1 }],
  };

  it("sends answers only — scoring happens server-side", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: JSON.parse(JSON.stringify(attempt)), error: null });
    const upsertTables: unknown[] = [];
    const sb = {
      rpc,
      from: vi.fn((table: string) => {
        upsertTables.push(table);
        return query({ data: null, error: null });
      }),
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } }) },
    };
    mockedSupabase.mockReturnValue(sb as never);
    const r = await submitAttempt("v", "exam", { q1: 1 });
    expect(rpc).toHaveBeenCalledWith(
      "submit_exam",
      { p_video: "v", p_kind: "exam", p_answers: { q1: 1 } },
    );
    expect(r.result.choice_score).toBe(1);
    expect(r.review?.[0]).toMatchObject({ id: "q1", right: true, correctIndex: 1 });
    expect(upsertTables).not.toContain("exam_results");
  });

  it("surfaces server rejections (graded lock, gates)", async () => {
    const sb = rpcMock(() => ({ data: null, error: { code: "P0001", message: "already graded" } }));
    mockedSupabase.mockReturnValue(sb as never);
    await expect(submitAttempt("v", "exam", { q1: 1 })).rejects.toMatchObject({ code: "P0001" });
  });
});

describe("getMyResult", () => {
  it("hides the key for pending attempts, reveals it for graded ones", async () => {
    const pending = {
      result: {
        answers: { q1: 0 }, choice_score: 0, choice_total: 1,
        writing_score: null, writing_total: 1, status: "pending", feedback: {},
      },
      questions: JSON.parse(JSON.stringify(stripped)),
      review: [{ id: "q1", picked: 0, right: null, correctIndex: null }],
    };
    const sb = rpcMock(() => ({ data: JSON.parse(JSON.stringify(pending)), error: null }));
    mockedSupabase.mockReturnValue(sb as never);
    const a = await getMyResult("v", "exam");
    expect(a?.result.status).toBe("pending");
    expect(a?.review?.[0]).toMatchObject({ correctIndex: null, right: null });
    expect(a?.questions.questions.every((q) => q.correct === null)).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/"correctIndex":\d/);
  });

  it("reveals correct indices only for graded (final) attempts", async () => {
    const graded = {
      result: {
        answers: { q1: 1 }, choice_score: 1, choice_total: 1,
        writing_score: null, writing_total: 0, status: "graded", feedback: {},
      },
      questions: JSON.parse(JSON.stringify(stripped)),
      review: [{ id: "q1", picked: 1, right: true, correctIndex: 1 }],
    };
    const sb = rpcMock(() => ({ data: JSON.parse(JSON.stringify(graded)), error: null }));
    mockedSupabase.mockReturnValue(sb as never);
    const a = await getMyResult("v", "exam");
    expect(a?.result.status).toBe("graded");
    expect(a?.review?.[0]).toMatchObject({ right: true, correctIndex: 1 });
  });
});

describe("gradeAttempt", () => {
  it("grades through the admin RPC, never direct updates", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const insert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "notifications") return { insert };
        return query({ data: null, error: null });
      }),
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "a1" } } } }) },
    };
    mockedSupabase.mockReturnValue(sb as never);
    await gradeAttempt("u1", "v", "exam", { q2: true }, { q2: "good" });
    expect(rpc).toHaveBeenCalledWith(
      "grade_writing",
      { p_user: "u1", p_video: "v", p_kind: "exam", p_score: 1, p_notes: { q2: "good" } },
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1" }));
  });
});

describe("listPendingGrading", () => {
  it("loads question context through the admin RPC", async () => {
    const sb = rpcMock((fn) => {
      if (fn === "get_exam_admin") {
        return { data: { content: JSON.parse(JSON.stringify(stripped)), key: {} }, error: null };
      }
      return { data: null, error: null };
    });
    (sb as { from: ReturnType<typeof vi.fn> }).from = vi.fn((table: string) => {
      if (table === "exam_results") {
        return query({
          data: [{
            user_id: "u1", video_id: "v", kind: "exam", answers: {},
            choice_score: 0, choice_total: 0, writing_total: 1,
            updated_at: "2026-01-01", profiles: { email: "s@e.c" },
          }],
          error: null,
        });
      }
      if (table === "videos") {
        return query({ data: { courses: { slug: "c" } }, error: null });
      }
      return query({ data: null, error: null });
    });
    mockedSupabase.mockReturnValue(sb as never);
    const rows = await listPendingGrading();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: "u1", course_slug: "c" });
    expect(rows[0].exam?.questions).toHaveLength(2);
  });
});
