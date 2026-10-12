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
import { ensureLessonNotices, getUserCourseViews, grantEnrollment, notifyNewLessons, resetUserVideo, resetUserViews, revokeEnrollment, searchUser, setBanned } from "../adminUsers";

const mockedSupabase = vi.mocked(supabase);

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit", "single", "maybeSingle", "insert", "update", "delete", "upsert", "in"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as { then: unknown }).then =
    (Promise.resolve(result) as Promise<unknown> as { then: unknown }).then.bind(Promise.resolve(result));
  return chain;
}

describe("searchUser", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("throws when supabase is not configured", async () => {
    await expect(searchUser("email", "a@b.c")).rejects.toThrow("supabase-not-configured");
  });

  it("returns null for blank input without querying", async () => {
    const sb = { from: vi.fn() };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(searchUser("phone", "   ")).resolves.toBeNull();
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("maps profile + tracks + enrollments", async () => {
    const profile = {
      id: "u1", email: "a@b.c", name: "Stu", phone: "010", national_id: null,
      grade: null, role: "student", banned: false,
    };
    let calls = 0;
    const sb = {
      from: vi.fn((table: string) => {
        calls += 1;
        if (table === "profiles") return query({ data: profile, error: null });
        if (table === "user_tracks") return query({ data: [{ track: "courses" }], error: null });
        return query({ data: [{ courses: { slug: "python-data" } }], error: null });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    const found = await searchUser("email", "A@B.C");
    expect(calls).toBe(3);
    expect(found).toMatchObject({ id: "u1", banned: false, tracks: ["courses"], enrolled: ["python-data"] });
    // email normalized to lowercase for citext lookup
    expect(sb.from).toHaveBeenCalledWith("profiles");
  });
});

describe("resetUserViews", () => {
  const session = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "a1" } } } }) } };

  it("throws when the admin session is gone", async () => {
    const sb = {
      ...session,
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      from: vi.fn(),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(resetUserViews("u1", "python-data")).rejects.toThrow("session expired");
  });

  it("throws when the course has no videos", async () => {
    const sb = {
      ...session,
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        return query({ data: [], error: null });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(resetUserViews("u1", "python-data")).rejects.toThrow("no video rows");
  });

  it("deletes the user's rows for the course videos", async () => {
    const del = vi.fn().mockReturnValue(query({ data: null, error: null, count: 3 }));
    const sb = {
      ...session,
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "videos") return query({ data: [{ id: "v1" }, { id: "v2" }], error: null });
        return { delete: del };
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(resetUserViews("u1", "python-data")).resolves.toEqual({ deleted: 3, total: 2 });
  });
});

describe("getUserCourseViews", () => {
  it("counts done lessons within the course only", async () => {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "videos") return query({ data: [{ id: "v1" }, { id: "v2" }, { id: "v3" }], error: null });
        return query({
          data: [
            { video_id: "v1", views_count: 3, done: true },
            { video_id: "v2", views_count: 1, done: false },
            { video_id: "other", views_count: 3, done: true },
          ],
          error: null,
        });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(getUserCourseViews("u1", "python-data")).resolves.toEqual({
      done: 1,
      total: 3,
      viewsUsed: 4,
      viewsTotal: 9,
    });
  });
});

describe("resetUserVideo", () => {
  const session = {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "a1" } } } }) },
  };

  it("updates (never deletes) to preserve the sticky unlock, then notifies", async () => {
    const update = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const insert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = {
      ...session,
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "videos")
          return query({ data: [{ id: "v1", module_id: "m1" }], error: null });
        if (table === "module_translations")
          return query({ data: { title: "Intro" }, error: null });
        if (table === "video_views") return { update };
        if (table === "notifications") return { insert };
        return query({ data: null, error: null });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(resetUserVideo("u1", "c", 0)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ views_count: 0, done: false }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1" }),
    );
  });
});

describe("notifyNewLessons", () => {
  it("writes lesson rows to the sessions widget, never general notifications", async () => {
    const insert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "enrollments") return query({ data: [{ user_id: "u1" }, { user_id: "u2" }], error: null });
        if (table === "upcoming_sessions") return { insert };
        return query({ data: null, error: null });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(notifyNewLessons("c", [{ titleEn: "Part 1", titleAr: "" }])).resolves.toBe(2);
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Array<{ user_id: string; title: string; date: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toContain("Part 1");
    expect(typeof rows[0].date).toBe("string");
    expect(sb.from).not.toHaveBeenCalledWith("notifications");
  });

  it("does nothing without lessons or enrolled users", async () => {
    const sb = { from: vi.fn() };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(notifyNewLessons("c", [])).resolves.toBe(0);
    expect(sb.from).not.toHaveBeenCalled();
  });
});

describe("ensureLessonNotices", () => {
  const lesson = [{ titleEn: "Part 1", titleAr: "" }];
  const title = "New lesson · درس جديد: Part 1";
  const since = "2000-01-01T00:00:00.000Z";
  const fresh = "2026-05-01T00:00:00.000Z";

  function sessionsMock(rows: Array<{ user_id: string; title: string; date: string }>, insert: ReturnType<typeof vi.fn>) {
    return {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "enrollments") return query({ data: [{ user_id: "u1" }, { user_id: "u2" }], error: null });
        if (table === "upcoming_sessions") return { ...query({ data: rows, error: null }), insert };
        return query({ data: null, error: null });
      }),
    };
  }

  it("skips insert when the trigger already covered everyone", async () => {
    const insert = vi.fn();
    const sb = sessionsMock(
      [{ user_id: "u1", title, date: fresh }, { user_id: "u2", title, date: fresh }],
      insert,
    );
    mockedSupabase.mockReturnValue(sb as never);
    await expect(ensureLessonNotices("c", lesson, since)).resolves.toBe(2);
    expect(insert).not.toHaveBeenCalled();
    expect(sb.from).not.toHaveBeenCalledWith("notifications");
  });

  it("fills only the gaps, sessions widget only", async () => {
    const insert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = sessionsMock([{ user_id: "u1", title, date: fresh }], insert);
    mockedSupabase.mockReturnValue(sb as never);
    await expect(ensureLessonNotices("c", lesson, since)).resolves.toBe(2);
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Array<{ user_id: string; title: string; date: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: "u2", title });
    expect(sb.from).not.toHaveBeenCalledWith("notifications");
  });

  it("ignores stale rows outside the save window", async () => {
    const insert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = sessionsMock(
      [{ user_id: "u1", title, date: "1999-01-01T00:00:00.000Z" }],
      insert,
    );
    mockedSupabase.mockReturnValue(sb as never);
    await expect(ensureLessonNotices("c", lesson, since)).resolves.toBe(2);
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Array<{ user_id: string }>;
    expect(rows.map((r) => r.user_id).sort()).toEqual(["u1", "u2"]);
  });
});

describe("grant/revoke/ban", () => {
  it("grants via upsert on resolved course id", async () => {
    const upsert = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        return { upsert };
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await grantEnrollment("u1", "python-data");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", course_id: "c1" },
      { onConflict: "user_id,course_id" },
    );
  });

  it("revokes and bans by id", async () => {
    const del = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const update = vi.fn().mockReturnValue(query({ data: null, error: null }));
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "videos") return query({ data: [{ id: "v1" }], error: null });
        if (table === "profiles") return { update };
        return { delete: del };
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await revokeEnrollment("u1", "python-data");
    expect(del).toHaveBeenCalled();
    await setBanned("u1", true);
    expect(update).toHaveBeenCalledWith({ banned: true });
  });
});
