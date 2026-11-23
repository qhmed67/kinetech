import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GATE,
  fetchAppGate,
  isUpdateRequired,
  notifyUpdateRequired,
  UPDATE_REQUIRED_EVENT,
  type NativeGate,
} from "../appGate";

const gate = (over: Partial<NativeGate> = {}): NativeGate => ({
  ...DEFAULT_GATE,
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isUpdateRequired", () => {
  it("never blocks without a gate (fail-open)", () => {
    expect(isUpdateRequired(null, "0.0.1")).toBe(false);
  });

  it("never blocks an unknown client version", () => {
    expect(isUpdateRequired(gate({ force_update: true, min_supported_version: "9.0.0" }), "")).toBe(false);
  });

  it("never blocks when the gate is disabled (kill switch)", () => {
    expect(
      isUpdateRequired(
        gate({ gate_enabled: false, force_update: true, min_supported_version: "9.0.0" }),
        "1.0.0",
      ),
    ).toBe(false);
  });

  it("never blocks when force_update is off (warn only)", () => {
    expect(
      isUpdateRequired(gate({ force_update: false, min_supported_version: "9.0.0" }), "1.0.0"),
    ).toBe(false);
  });

  it("blocks an older version when force_update is on", () => {
    expect(
      isUpdateRequired(gate({ force_update: true, min_supported_version: "2.0.0" }), "1.9.9"),
    ).toBe(true);
    expect(
      isUpdateRequired(gate({ force_update: true, min_supported_version: "2.0.0" }), "2.0.0"),
    ).toBe(false);
    expect(
      isUpdateRequired(gate({ force_update: true, min_supported_version: "2.0.0" }), "2.0.1"),
    ).toBe(false);
  });

  it("never blocks on an unparsable client version", () => {
    expect(
      isUpdateRequired(gate({ force_update: true, min_supported_version: "9.0.0" }), "1.0"),
    ).toBe(false);
  });
});

describe("fetchAppGate", () => {
  it("returns null when the endpoint is unreachable (fail-open)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    expect(await fetchAppGate()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns null on a non-ok answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchAppGate()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("normalizes a valid answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          native_gate: {
            gate_enabled: true,
            min_supported_version: "1.2.0",
            force_update: true,
            message_ar: "حدّث",
            message_en: "Update",
          },
        }),
      }),
    );
    const g = await fetchAppGate();
    expect(g).toEqual({
      gate_enabled: true,
      min_supported_version: "1.2.0",
      force_update: true,
      message_ar: "حدّث",
      message_en: "Update",
    });
    vi.unstubAllGlobals();
  });
});

describe("notifyUpdateRequired", () => {
  it("broadcasts the event on the window", () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(UPDATE_REQUIRED_EVENT, listener);
    notifyUpdateRequired({ en: "Update", minSupportedVersion: "2.0.0" });
    window.removeEventListener(UPDATE_REQUIRED_EVENT, listener);
    expect(seen).toHaveLength(1);
    expect((seen[0] as { en?: string }).en).toBe("Update");
  });
});
