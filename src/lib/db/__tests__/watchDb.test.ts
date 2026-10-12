import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  supabase: vi.fn(),
}));

import { supabase } from "../client";
import { completeVideoDb, reportVideoMins } from "../watchDb";

const mockedSupabase = vi.mocked(supabase);

describe("completeVideoDb version tolerance", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("throws when supabase is not configured", async () => {
    await expect(completeVideoDb("v1", 10, 60)).rejects.toThrow("supabase-not-configured");
  });

  it("uses the 4-param call when the server supports it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await completeVideoDb("v1", 50, 60);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("complete_video", {
      p_video: "v1",
      p_watched_secs: 50,
      p_duration_secs: 60,
      p_ended: false,
    });
  });

  it("sends p_ended through on video end", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await completeVideoDb("v1", 0, 0, true);
    expect(rpc).toHaveBeenCalledWith("complete_video", {
      p_video: "v1",
      p_watched_secs: 0,
      p_duration_secs: 0,
      p_ended: true,
    });
  });

  it("falls back through older shapes on 42883", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "42883", message: "no 4-param shape" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42883", message: "no 3-param shape" } })
      .mockResolvedValueOnce({ data: null, error: null });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await completeVideoDb("v1", 50, 60);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_video", {
      p_video: "v1",
      p_watched_secs: 50,
      p_duration_secs: 60,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "complete_video", {
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

describe("reportVideoMins self-heal", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("throws when supabase is not configured", async () => {
    await expect(reportVideoMins("v1", 12)).rejects.toThrow("supabase-not-configured");
  });

  it("reports rounded minutes to the server", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await reportVideoMins("v1", 12);
    expect(rpc).toHaveBeenCalledWith("report_video_mins", { p_video: "v1", p_mins: 12 });
  });

  it("stays silent on pre-migration DBs (42883)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42883", message: "no function" } });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await expect(reportVideoMins("v1", 12)).resolves.toBeUndefined();
  });

  it("surfaces real errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "lesson not opened" } });
    mockedSupabase.mockReturnValue({ rpc } as never);
    await expect(reportVideoMins("v1", 12)).rejects.toMatchObject({ code: "P0001" });
  });
});
