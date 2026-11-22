import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authFor,
  clearTokenCache,
  parseCredentials,
  pickCredential,
} from "../src/credentials";

afterEach(() => {
  clearTokenCache();
  vi.unstubAllGlobals();
});

describe("parseCredentials", () => {
  it("parses an api-key entry", () => {
    expect(parseCredentials('[{"type":"apikey","key":"AIzaTest"}]')).toEqual([
      { type: "apikey", key: "AIzaTest" },
    ]);
  });

  it("parses a service-account entry from an inline object", () => {
    const raw = JSON.stringify([
      { type: "service_account", json: { client_email: "sa@x.iam", private_key: "-----BEGIN-----" } },
    ]);
    const pool = parseCredentials(raw);
    expect(pool).toHaveLength(1);
    expect(pool[0].type).toBe("service_account");
  });

  it("drops malformed entries without throwing", () => {
    expect(parseCredentials("not json")).toEqual([]);
    expect(parseCredentials('{"type":"apikey"}')).toEqual([]);
    expect(parseCredentials('[{"type":"apikey","key":""},{"type":"nope"}]')).toEqual([]);
    expect(parseCredentials('[{"type":"service_account","json":"{bad"}]')).toEqual([]);
  });

  it("treats a missing value as an empty pool", () => {
    expect(parseCredentials(undefined)).toEqual([]);
    expect(parseCredentials("  ")).toEqual([]);
  });
});

describe("pickCredential (round-robin)", () => {
  const pool = [
    { type: "apikey" as const, key: "a" },
    { type: "apikey" as const, key: "b" },
    { type: "apikey" as const, key: "c" },
  ];

  it("cycles through the pool", () => {
    expect(pickCredential(pool, 0)).toMatchObject({ key: "a" });
    expect(pickCredential(pool, 1)).toMatchObject({ key: "b" });
    expect(pickCredential(pool, 2)).toMatchObject({ key: "c" });
    expect(pickCredential(pool, 3)).toMatchObject({ key: "a" });
  });

  it("handles negative counters and empty pools", () => {
    expect(pickCredential(pool, -1)).toMatchObject({ key: "c" });
    expect(pickCredential([], 0)).toBeNull();
  });
});

describe("authFor", () => {
  it("turns an api key into query auth", async () => {
    expect(await authFor({ type: "apikey", key: "AIza" })).toEqual({ kind: "key", key: "AIza" });
  });

  it("returns null for an unusable service account", async () => {
    expect(
      await authFor({ type: "service_account", json: { client_email: "", private_key: "" } }),
    ).toBeNull();
  });
});
