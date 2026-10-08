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
  getNotifications,
  getUpcomingSessions,
  markNotificationsRead,
} from "../activityDb";

const mockedSupabase = vi.mocked(supabase);

/** Minimal thenable query builder honoring the chained filters used by the adapter. */
function query(rows: unknown[] = [], error: unknown = null) {
  const terminal = Promise.resolve({ data: rows, error });
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "gte", "order", "limit", "eq", "update"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Awaiting the chain resolves like the real Postgrest builder.
  (chain as { then: unknown }).then =
    terminal.then.bind(terminal) as unknown;
  return chain;
}

function clientWith(opts: {
  sessions?: unknown[];
  notifs?: unknown[];
  session?: { user: { id: string } } | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "upcoming_sessions") return query(opts.sessions ?? []);
      if (table === "notifications") return query(opts.notifs ?? []);
      return query([]);
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: opts.session ?? null },
      }),
    },
  };
}

describe("getUpcomingSessions", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("throws when supabase is not configured", async () => {
    await expect(getUpcomingSessions()).rejects.toThrow("supabase-not-configured");
  });

  it("maps rows and returns empty array when none", async () => {
    mockedSupabase.mockReturnValue(
      clientWith({
        sessions: [{ id: "1", title: "Lab", date: "2026-10-20T18:00:00Z" }],
      }) as never,
    );
    const rows = await getUpcomingSessions();
    expect(rows).toEqual([{ id: "1", title: "Lab", date: "2026-10-20T18:00:00Z" }]);

    mockedSupabase.mockReturnValue(clientWith({ sessions: [] }) as never);
    await expect(getUpcomingSessions()).resolves.toEqual([]);
  });
});

describe("getNotifications", () => {
  beforeEach(() => {
    mockedSupabase.mockReturnValue(null);
  });

  it("maps is_read and defaults missing message", async () => {
    mockedSupabase.mockReturnValue(
      clientWith({
        notifs: [
          { id: "a", title: "Hi", message: "hey", is_read: false },
          { id: "b", title: "Old", message: null, is_read: true },
        ],
      }) as never,
    );
    const rows = await getNotifications();
    expect(rows).toEqual([
      { id: "a", title: "Hi", message: "hey", is_read: false },
      { id: "b", title: "Old", message: "", is_read: true },
    ]);
  });
});

describe("markNotificationsRead", () => {
  it("does nothing without a session", async () => {
    const sb = clientWith({}) as never;
    mockedSupabase.mockReturnValue(sb);
    await markNotificationsRead();
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("marks unread rows read for the signed-in user", async () => {
    const sb = clientWith({ session: { user: { id: "u1" } } });
    mockedSupabase.mockReturnValue(sb as never);
    await markNotificationsRead();
    expect(sb.from).toHaveBeenCalledWith("notifications");
  });
});
