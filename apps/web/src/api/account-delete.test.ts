import { beforeEach, describe, expect, it, vi } from "vitest";
import handler, { type ApiResponse } from "../../api/account-delete.ts";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";

const mockedCreate = vi.mocked(createClient);
const ENV = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

function resCapture() {
  const seen: { code?: number; payload?: Record<string, unknown> } = {};
  const res = {
    status: vi.fn((code: number) => {
      seen.code = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      seen.payload = payload as Record<string, unknown>;
      return payload;
    }),
  };
  return { res: res as unknown as ApiResponse, seen };
}

function req(confirm: unknown, token: string | null = "jwt") {
  return {
    method: "POST",
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    body: { confirm },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
});

describe("POST /api/account-delete", () => {
  it("rejects wrong method, missing confirmation and missing token", async () => {
    const { res, seen } = resCapture();
    await handler({ method: "GET", headers: {}, body: {} }, res);
    expect(seen.code).toBe(405);

    const { res: r2, seen: s2 } = resCapture();
    await handler(req("delete"), r2);
    expect(s2.code).toBe(400);

    const { res: r3, seen: s3 } = resCapture();
    await handler(req("DELETE", null), r3);
    expect(s3.code).toBe(401);
  });

  it("deletes only the authenticated user", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    mockedCreate.mockImplementation(((...args: unknown[]) => {
      if (args[1] === ENV.SUPABASE_SERVICE_ROLE_KEY) {
        return { auth: { admin: { deleteUser } } };
      }
      return {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
        },
      };
    }) as never);

    const { res, seen } = resCapture();
    await handler(req("DELETE"), res);

    expect(seen.code).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });
});
