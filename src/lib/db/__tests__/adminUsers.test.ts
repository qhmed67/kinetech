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
import { grantEnrollment, resetUserViews, revokeEnrollment, searchUser, setBanned } from "../adminUsers";

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
  it("returns 0 when the course has no videos", async () => {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        return query({ data: [], error: null });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(resetUserViews("u1", "python-data")).resolves.toBe(0);
  });

  it("deletes the user's rows for the course videos", async () => {
    const del = vi.fn().mockReturnValue(query({ data: null, error: null, count: 3 }));
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "courses") return query({ data: { id: "c1" }, error: null });
        if (table === "videos") return query({ data: [{ id: "v1" }, { id: "v2" }], error: null });
        return { delete: del };
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    await expect(resetUserViews("u1", "python-data")).resolves.toBe(3);
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
