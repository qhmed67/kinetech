import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  supabase: vi.fn(),
}));

import { supabase } from "../client";
import { completeVideoDb } from "../watchDb";

const mockedSupabase = vi.mocked(supabase);

describe("completeVideoDb version tolerance", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("throws when supabase is not configured", async () => {
    await expect(completeVideoDb("v1", 10, 60)).rejects.toThrow("supabase-not-configured");
  });

  it("uses the 3-param call when the server supports it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await completeVideoDb("v1", 50, 60);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("complete_video", {
      p_video: "v1",
      p_watched_secs: 50,
      p_duration_secs: 60,
    });
  });

  it("falls back to the 2-param shape on 42883", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "42883", message: "function does not exist" } })
      .mockResolvedValueOnce({ data: null, error: null });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await completeVideoDb("v1", 50, 60);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_video", {
      p_video: "v1",
      p_watched_secs: 50,
    });
  });

  it("throws real (non-42883) errors without fallback", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "watch requirement not met" } });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await expect(completeVideoDb("v1", 1, 60)).rejects.toMatchObject({ code: "P0001" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
