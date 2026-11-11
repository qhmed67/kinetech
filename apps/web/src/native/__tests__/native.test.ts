import { afterEach, describe, expect, it, vi } from "vitest";
import { NATIVE_EVENT } from "@kinetech/bridge";
import { bridgeOn, bridgeSend, hasNativeUserAgent, isNativeApp } from "../index";

describe("web side of the shell bridge", () => {
  afterEach(() => {
    delete window.__KT_NATIVE__;
    delete window.ReactNativeWebView;
    vi.restoreAllMocks();
  });

  it("is not native in a plain browser", () => {
    expect(isNativeApp()).toBe(false);
  });

  it("is native when the shell injected the flag", () => {
    window.__KT_NATIVE__ = true;
    expect(isNativeApp()).toBe(true);
  });

  it("does not trust the user agent on its own", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 KineTechApp/1.0");
    expect(hasNativeUserAgent()).toBe(true);
    expect(isNativeApp()).toBe(false);
  });

  it("sends a message through the webview bridge", () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    const ok = bridgeSend({ v: 1, type: "playVideo", lessonId: "vid_1" });
    expect(ok).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postMessage.mock.calls[0][0] as string)).toEqual({
      v: 1,
      type: "playVideo",
      lessonId: "vid_1",
    });
  });

  it("does nothing when there is no shell", () => {
    expect(bridgeSend({ v: 1, type: "logout" })).toBe(false);
  });

  it("receives native messages of the requested type only", () => {
    const seen: string[] = [];
    const off = bridgeOn("playerClosed", (m) => seen.push(m.lessonId));
    window.dispatchEvent(
      new CustomEvent(NATIVE_EVENT, { detail: { v: 1, type: "playerClosed", lessonId: "a", progressSec: 10 } }),
    );
    window.dispatchEvent(
      new CustomEvent(NATIVE_EVENT, { detail: { v: 1, type: "deviceStatus", ok: true } }),
    );
    window.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: { v: 9, type: "playerClosed" } }));
    expect(seen).toEqual(["a"]);
    off();
    window.dispatchEvent(
      new CustomEvent(NATIVE_EVENT, { detail: { v: 1, type: "playerClosed", lessonId: "b", progressSec: 1 } }),
    );
    expect(seen).toEqual(["a"]);
  });
});
