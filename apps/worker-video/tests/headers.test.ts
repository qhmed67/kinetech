import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  matchOrigin,
  normalizeOriginPattern,
  preflightHeaders,
  resolveCors,
  streamHeaders,
  unsatisfiableHeaders,
} from "../src/headers";

const ALLOWED = ["https://kinetechtest.vercel.app", "https://*.vercel.app"];

describe("origin matching", () => {
  it("matches exact origins", () => {
    expect(matchOrigin("https://kinetechtest.vercel.app", ALLOWED)).toBe(true);
    expect(matchOrigin("https://evil.example", ALLOWED)).toBe(false);
  });

  it("matches wildcard subdomains", () => {
    expect(matchOrigin("https://git-feat-x.vercel.app", ALLOWED)).toBe(true);
  });

  it("matches the multi-label hyphenated preview host via *.vercel.app", () => {
    const host = "https://kinetechtest-aggtkiwi5-owner-team-scope-placeholder.vercel.app";
    expect(matchOrigin(host, ["https://*.vercel.app"])).toBe(true);
    expect(matchOrigin(host, ["https://kinetechtest.vercel.app", "https://*.vercel.app"])).toBe(true);
    expect(matchOrigin("https://a-b.c.vercel.app", ["https://*.vercel.app"])).toBe(true);
  });

  it("does NOT match https://evilvercel.app for *.vercel.app", () => {
    expect(matchOrigin("https://evilvercel.app", ["https://*.vercel.app"])).toBe(false);
    expect(matchOrigin("https://vercel.app", ["https://*.vercel.app"])).toBe(false);
  });

  it("matches with case-insensitive scheme/host", () => {
    expect(matchOrigin("HTTPS://KinEtEchTest.Vercel.App", ["https://kinetechtest.vercel.app"])).toBe(true);
    expect(matchOrigin("https://kinetechtest.vercel.app:443", ["https://kinetechtest.vercel.app"])).toBe(true);
  });

  it("normalizes entries: trailing slashes, quotes, whitespace", () => {
    expect(normalizeOriginPattern("  https://git-feat-x.vercel.app/  ")).toBe("https://git-feat-x.vercel.app");
    expect(normalizeOriginPattern("'https://git-feat-x.vercel.app'")).toBe("https://git-feat-x.vercel.app");
    expect(normalizeOriginPattern('"https://git-feat-x.vercel.app/"')).toBe("https://git-feat-x.vercel.app");
    expect(normalizeOriginPattern("")).toBe(null);
    expect(normalizeOriginPattern("   ")).toBe(null);
    expect(normalizeOriginPattern("https://*.vercel.app")).toBe("https://*.vercel.app");
  });

  it("is exact on scheme + host + port", () => {
    expect(matchOrigin("http://kinetechtest.vercel.app", ["https://kinetechtest.vercel.app"])).toBe(false);
    expect(matchOrigin("https://kinetechtest.vercel.app:8443", ["https://kinetechtest.vercel.app"])).toBe(false);
  });
});

describe("resolveCors", () => {
  it("allows a matching Origin", () => {
    const req = new Request("https://w.dev/v", {
      headers: { origin: "https://kinetechtest.vercel.app" },
    });
    expect(resolveCors(req, ALLOWED)).toMatchObject({ allowed: true, source: "origin" });
  });

  it("blocks a foreign Origin", () => {
    const req = new Request("https://w.dev/v", { headers: { origin: "https://evil.example" } });
    expect(resolveCors(req, ALLOWED).allowed).toBe(false);
  });

  it("blocks a no-origin non-GET/HEAD (policy missing)", () => {
    const req = new Request("https://w.dev/v", { method: "POST" });
    expect(resolveCors(req, ALLOWED).allowed).toBe(false);
  });

  it("allows a no-origin GET/HEAD (media elements)", () => {
    expect(resolveCors(new Request("https://w.dev/v"), ALLOWED)).toMatchObject({
      allowed: true,
      source: "none",
    });
    expect(resolveCors(new Request("https://w.dev/v", { method: "HEAD" }), ALLOWED).allowed).toBe(true);
  });

  it("falls back to the Referer origin", () => {
    const req = new Request("https://w.dev/v", {
      headers: { referer: "https://kinetechtest.vercel.app/#/watch" },
    });
    const decision = resolveCors(req, ALLOWED);
    expect(decision).toMatchObject({ allowed: true, source: "referer" });
  });
});

describe("response headers", () => {
  it("builds a correct 206 with Content-Range and length", () => {
    const headers = streamHeaders({
      start: 100,
      end: 199,
      size: 1000,
      contentType: "video/mp4",
      cors: {},
    });
    expect(headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(headers.get("content-length")).toBe("100");
    expect(headers.get("accept-ranges")).toBe("bytes");
    expect(headers.get("content-type")).toBe("video/mp4");
  });

  it("builds a 416 with `bytes */size` and no body", () => {
    const headers = unsatisfiableHeaders(1000, {});
    expect(headers.get("content-range")).toBe("bytes */1000");
    expect(headers.get("content-length")).toBe("0");
  });

  it("adds ACAO only for an allowed real Origin", () => {
    expect(
      corsHeaders({ allowed: true, origin: "https://kinetechtest.vercel.app", source: "origin" }),
    ).toMatchObject({ "access-control-allow-origin": "https://kinetechtest.vercel.app" });
    expect(corsHeaders({ allowed: true, origin: null, source: "none" })).toEqual({});
    expect(
      corsHeaders({ allowed: false, origin: "https://evil.example", source: "origin" }),
    ).toEqual({});
  });

  it("answers preflight only for an allowed Origin", () => {
    const ok = preflightHeaders({
      allowed: true,
      origin: "https://kinetechtest.vercel.app",
      source: "origin",
    });
    expect(ok?.["access-control-allow-methods"]).toContain("GET");
    expect(
      preflightHeaders({ allowed: false, origin: "https://evil.example", source: "origin" }),
    ).toBeNull();
  });
});
