import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  matchOrigin,
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

  it("falls back to the Referer origin", () => {
    const req = new Request("https://w.dev/v", {
      headers: { referer: "https://kinetechtest.vercel.app/#/watch" },
    });
    const decision = resolveCors(req, ALLOWED);
    expect(decision).toMatchObject({ allowed: true, source: "referer" });
  });

  it("allows a no-origin request (media elements)", () => {
    const req = new Request("https://w.dev/v");
    expect(resolveCors(req, ALLOWED)).toMatchObject({ allowed: true, source: "none" });
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
