import { describe, expect, it } from "vitest";
import {
  BRIDGE_VERSION,
  isNativeToWeb,
  isWebToNative,
  NATIVE_EVENT,
  parseMessage,
  type WebToNative,
} from "@kinetech/bridge";

describe("bridge message validation", () => {
  it("accepts a well formed web → native message", () => {
    const msg = parseMessage(JSON.stringify({ v: 1, type: "playVideo", lessonId: "vid_123" }));
    expect(msg).toEqual({ v: 1, type: "playVideo", lessonId: "vid_123" });
    expect(msg && isWebToNative(msg)).toBe(true);
  });

  it("drops unknown types", () => {
    expect(parseMessage({ v: 1, type: "runThis", cmd: "rm -rf" })).toBeNull();
  });

  it("drops a wrong protocol version", () => {
    expect(parseMessage({ v: 2, type: "playVideo", lessonId: "x" })).toBeNull();
    expect(parseMessage({ type: "playVideo", lessonId: "x" })).toBeNull();
  });

  it("drops malformed payloads", () => {
    expect(parseMessage("not json")).toBeNull();
    expect(parseMessage({ v: 1, type: "playVideo" })).toBeNull();
    expect(parseMessage({ v: 1, type: "playVideo", lessonId: "" })).toBeNull();
    expect(parseMessage({ v: 1, type: "playerClosed", lessonId: "x" })).toBeNull();
    expect(parseMessage({ v: 1, type: "downloadState", lessonId: "x", state: "weird" })).toBeNull();
  });

  it("keeps ids only — no urls or tokens are carried", () => {
    const msg = parseMessage({ v: 1, type: "playVideo", lessonId: "vid_123" }) as WebToNative;
    expect(Object.keys(msg).sort()).toEqual(["lessonId", "type", "v"]);
    expect(JSON.stringify(msg)).not.toMatch(/https?:\/\//);
  });

  it("separates the two directions", () => {
    const toNative = parseMessage({ v: 1, type: "logout" });
    const toWeb = parseMessage({ v: 1, type: "deviceStatus", ok: false, reason: "rooted" });
    expect(toNative && isWebToNative(toNative)).toBe(true);
    expect(toWeb && isNativeToWeb(toWeb)).toBe(true);
    expect(toNative && isNativeToWeb(toNative)).toBe(false);
  });

  it("uses a stable version constant", () => {
    expect(BRIDGE_VERSION).toBe(1);
    expect(NATIVE_EVENT).toBe("kt:native");
  });
});
