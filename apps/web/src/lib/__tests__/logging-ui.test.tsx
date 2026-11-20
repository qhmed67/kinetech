import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";

import { log, newCorrelationId, withCorrelation } from "../logger";
import { apiFetch } from "../http";
import { installGlobalErrorHandlers } from "../globalErrors";
import { ErrorBoundary } from "../../components/ErrorBoundary";

function captureLines(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(globalThis.console, "info").mockImplementation((value?: unknown) => {
    lines.push(String(value));
  });
  return { lines, restore: () => spy.mockRestore() };
}

function records(lines: string[]): Array<Record<string, unknown>> {
  return lines.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  process.env.LOG_LEVEL = "info";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("client logging context (13.6.4)", () => {
  it("scopes a correlation id across async work and restores the parent", async () => {
    const { lines, restore } = captureLines();
    try {
      await withCorrelation("req_parent", async () => {
        log("info", "ctx.outer", "outer", { module: "test" });
        await withCorrelation("req_child", async () => {
          log("info", "ctx.inner", "inner", { module: "test" });
        });
        log("info", "ctx.back", "back", { module: "test" });
      });
      log("info", "ctx.none", "none", { module: "test" });

      const parsed = records(lines);
      expect(parsed.map((record) => record.correlation_id)).toEqual([
        "req_parent",
        "req_child",
        "req_parent",
        undefined,
      ]);
      expect(newCorrelationId()).toMatch(/^req_[A-Za-z0-9._:-]+$/);
    } finally {
      restore();
    }
  });

  it("redacts urls and secrets from messages and context", () => {
    const { lines, restore } = captureLines();
    try {
      log("warn", "test.redact", "Bearer abc123 https://secret.example/video", {
        module: "test",
        ctx: { password: "hunter2", nested: { authorization: "Bearer xyz" }, note: "https://x.test" },
      });
      const record = records(lines)[0];
      const text = JSON.stringify(record);
      expect(text).not.toContain("abc123");
      expect(text).not.toContain("hunter2");
      expect(text).not.toContain("secret.example");
      expect(text).not.toContain("x.test");
      expect((record.ctx as Record<string, unknown>).password).toBe("[REDACTED]");
    } finally {
      restore();
    }
  });
});

describe("apiFetch (13.6.4)", () => {
  it("sends x-request-id and logs start/end with status and duration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const { lines, restore } = captureLines();
    try {
      const response = await apiFetch("/api/config?secret=abc", { method: "POST" });
      expect(response.status).toBe(200);

      const sent = fetchMock.mock.calls[0][1] as { headers: Headers };
      const id = sent.headers.get("x-request-id");
      expect(id).toMatch(/^req_/);

      const parsed = records(lines);
      expect(parsed.map((record) => record.event)).toEqual(["ui.request.start", "ui.request.end"]);
      expect(parsed[0].correlation_id).toBe(id);
      expect((parsed[0].ctx as Record<string, unknown>).route).toBe("/api/config");
      expect((parsed[1].ctx as Record<string, unknown>).status).toBe(200);
      expect(typeof (parsed[1].ctx as Record<string, unknown>).duration_ms).toBe("number");
      expect(JSON.stringify(parsed)).not.toContain("secret=abc");
    } finally {
      restore();
    }
  });

  it("logs a network failure as an error with a registered code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { lines, restore } = captureLines();
    try {
      await expect(apiFetch("/api/play", { method: "POST" })).rejects.toThrow("offline");
      const end = records(lines).find((record) => record.event === "ui.request.end");
      expect(end?.level).toBe("error");
      expect((end?.error as Record<string, unknown>).code).toBe("SYS_001");
      expect((end?.ctx as Record<string, unknown>).status).toBe(0);
    } finally {
      restore();
    }
  });
});

describe("global errors and boundary (13.6.4)", () => {
  it("logs window errors and rejections once", () => {
    installGlobalErrorHandlers();
    installGlobalErrorHandlers(); // idempotent under StrictMode
    const { lines, restore } = captureLines();
    try {
      window.dispatchEvent(new ErrorEvent("error", { message: "render boom" }));
      const rejection = new Event("unhandledrejection");
      Object.defineProperty(rejection, "reason", { value: new TypeError("promise boom") });
      window.dispatchEvent(rejection);

      const parsed = records(lines).filter((record) => record.event === "ui.error.global");
      expect(parsed).toHaveLength(2);
      expect(parsed[0].level).toBe("error");
      expect((parsed[0].error as Record<string, unknown>).message).toBe("render boom");
      expect((parsed[1].error as Record<string, unknown>).type).toBe("TypeError");
    } finally {
      restore();
    }
  });

  it("shows a bilingual fallback and logs when a child throws", () => {
    const reactError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { lines, restore } = captureLines();
    class Boom extends Component<{ children?: ReactNode }> {
      render(): ReactNode {
        throw new Error("child boom");
      }
    }
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      expect(screen.getByText(/Something went wrong|حصل خطأ غير متوقع/)).toBeDefined();
      const boundary = records(lines).find((record) => record.event === "ui.error.boundary");
      expect(boundary?.level).toBe("error");
      expect((boundary?.error as Record<string, unknown>).message).toBe("child boom");
    } finally {
      restore();
      reactError.mockRestore();
    }
  });
});
