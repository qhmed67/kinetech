import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  supabase: vi.fn(),
}));

vi.mock("../throttle", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../throttle")>();
  return { ...mod, withTimeout: <T>(p: Promise<T>) => p };
});

import { supabase } from "../client";
import { pushCourseToDb, takeFreshLessons } from "../sync";
import type { StoreCourse } from "../../../store";

const mockedSupabase = vi.mocked(supabase);

/** Thenable postgrest-style chain resolving to result. */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "limit", "upsert", "insert", "update", "delete", "order"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  (c as { then: unknown }).then =
    (Promise.resolve(result) as Promise<unknown> as { then: unknown }).then.bind(Promise.resolve(result));
  return c;
}

const lt = { en: "", ar: "" };
const mod = (t: string) => ({ t, d: "" });
function course(mods: string[], srcs: (string | "")[]): StoreCourse {
  return {
    slug: "c1",
    cat: "tech",
    bac: false,
    cta: { ...lt },
    name: { en: "C", ar: "" },
    designation: { ...lt },
    quote: { ...lt },
    duration: { ...lt },
    lessons: { ...lt },
    schedule: { ...lt },
    level: { ...lt },
    seats: { ...lt },
    seatsN: 6,
    price: null,
    photoCard: "",
    photoDetail: "",
    instructor: { name: { ...lt }, spec: { ...lt }, bio: { ...lt } },
    outcomes: { en: [], ar: [] },
    modules: { en: mods.map(mod), ar: mods.map(mod) },
    sections: { en: mods.map(() => ""), ar: mods.map(() => "") },
    videos: srcs.map((src) => ({ src, mins: 10, assign: "", exam: "" })),
  };
}

type Cfg = {
  modules?: Array<{ id: string; sort_order: number }>;
  sources?: Array<{ video_id: string; sort_order: number; src_url: string }>;
  videoError?: { message: string } | null;
  moduleInsertError?: { message: string } | null;
};

function rig(c: Cfg = {}) {
  const calls: { upserts: unknown[]; srcSets: unknown[]; deletes: unknown[] } = {
    upserts: [],
    srcSets: [],
    deletes: [],
  };
  const rpc = vi.fn((fn: string, args: unknown) => {
    if (fn === "admin_video_sources") {
      return Promise.resolve({ data: c.sources ?? [], error: null });
    }
    if (fn === "admin_upsert_video") {
      calls.upserts.push(args);
      if (c.videoError) return Promise.resolve({ data: null, error: c.videoError });
      const order = (args as { p_order: number }).p_order;
      return Promise.resolve({ data: `v-new-${order}`, error: null });
    }
    if (fn === "admin_set_video_src") {
      calls.srcSets.push(args);
      return Promise.resolve({ data: null, error: null });
    }
    if (fn === "admin_delete_video") {
      calls.deletes.push(args);
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  const sb = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "instructors") return chain({ data: [{ id: "ins1" }], error: null });
      if (table === "courses") return chain({ data: { id: "cdb1" }, error: null });
      if (table === "course_translations") return chain({ data: null, error: null });
      if (table === "modules") {
        const modChain = chain({ data: c.modules ?? [], error: null });
        if (c.moduleInsertError) {
          (modChain.insert as ReturnType<typeof vi.fn>).mockReturnValue(
            chain({ data: null, error: c.moduleInsertError }),
          );
        } else {
          (modChain.insert as ReturnType<typeof vi.fn>).mockReturnValue(
            chain({ data: { id: "m-new" }, error: null }),
          );
        }
        return modChain;
      }
      if (table === "module_translations") return chain({ data: null, error: null });
      return chain({ data: null, error: null });
    }),
  };
  mockedSupabase.mockReturnValue(sb as never);
  return { calls, rpc, sb };
}

beforeEach(() => {
  mockedSupabase.mockReturnValue(null);
  takeFreshLessons();
});

describe("pushCourseToDb add flow", () => {
  it("inserts the new module, upserts its video, sets the src, reports fresh", async () => {
    const { calls, rpc, sb } = rig({
      modules: [{ id: "m0", sort_order: 0 }],
      sources: [{ video_id: "v0", sort_order: 0, src_url: "https://youtu.be/AAA111AAA11" }],
    });
    const ok = await pushCourseToDb(course(["Part 1", "Part 2"], ["https://youtu.be/AAA111AAA11", "https://youtu.be/BBB222BBB22"]));
    expect(ok).toBe(true);
    // upsert RPC runs per part (update-in-place for existing, insert for new)
    expect(calls.upserts).toHaveLength(2);
    expect(calls.upserts.map((a) => (a as { p_order: number }).p_order)).toEqual([0, 1]);
    expect(calls.srcSets).toHaveLength(2);
    expect(calls.srcSets[1]).toMatchObject({ p_video: "v-new-1", p_src: "https://youtu.be/BBB222BBB22" });
    // novelty detected exactly once, with the new part's titles
    expect(takeFreshLessons()).toEqual([{ titleEn: "Part 2", titleAr: "Part 2" }]);
    // no direct videos table writes anywhere in the push
    expect(rpc).toHaveBeenCalledWith("admin_video_sources", { p_slug: "c1" });
    const tables = (sb.from as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).not.toContain("videos");
  });

  it("stays silent (no fresh) when only minutes change", async () => {
    rig({
      modules: [{ id: "m0", sort_order: 0 }],
      sources: [{ video_id: "v0", sort_order: 0, src_url: "https://youtu.be/AAA111AAA11" }],
    });
    const ok = await pushCourseToDb(course(["Part 1"], ["https://youtu.be/AAA111AAA11"]));
    expect(ok).toBe(true);
    expect(takeFreshLessons()).toEqual([]);
  });

  it("throws loudly when a module insert is denied", async () => {
    rig({ modules: [], moduleInsertError: { message: 'new row violates row-level security for table "modules"' } });
    await expect(pushCourseToDb(course(["New"], ["https://youtu.be/AAA111AAA11"]))).rejects.toThrow(/modules:/);
    expect(takeFreshLessons()).toEqual([]);
  });
});

describe("pushCourseToDb delete flow", () => {
  it("deletes dropped tail modules when the course is emptied", async () => {
    const modDelete = vi.fn().mockReturnValue(chain({ data: null, error: null }));
    const sb = {
      rpc: vi.fn((fn: string) => {
        if (fn === "admin_video_sources") return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn((table: string) => {
        if (table === "instructors") return chain({ data: [{ id: "ins1" }], error: null });
        if (table === "courses") return chain({ data: { id: "cdb1" }, error: null });
        if (table === "course_translations") return chain({ data: null, error: null });
        if (table === "modules") {
          const ch = chain({ data: [{ id: "m0", sort_order: 0 }, { id: "m1", sort_order: 1 }], error: null });
          (ch.delete as ReturnType<typeof vi.fn>).mockImplementation(() => {
            modDelete();
            return chain({ data: null, error: null });
          });
          return ch;
        }
        return chain({ data: null, error: null });
      }),
    };
    mockedSupabase.mockReturnValue(sb as never);
    // local shrunk to zero lessons and no videos
    const ok = await pushCourseToDb(course([], []));
    expect(ok).toBe(true);
    expect(modDelete).toHaveBeenCalledTimes(2);
    expect(takeFreshLessons()).toEqual([]);
  });
});
