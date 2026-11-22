import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DirectDriveVideoPlayer } from "./DirectDriveVideoPlayer";

const SRC = "https://www.googleapis.com/drive/v3/files/f1?alt=media&key=AIzaTest&supportsAllDrives=true";

beforeAll(() => {
  // jsdom has no TextTrack; Plyr's constructor calls Object.isTrack(textTrack).
  try {
    if (typeof window !== "undefined" && !("TextTrack" in window)) {
      (window as unknown as { TextTrack: unknown }).TextTrack = class TextTrackStub {};
    }
  } catch {
    /* ignore */
  }
});

function video(): HTMLVideoElement {
  return document.querySelector("video") as HTMLVideoElement;
}

async function dispatchError() {
  await act(async () => {
    video().dispatchEvent(new Event("error"));
    await Promise.resolve();
  });
}

describe("DirectDriveVideoPlayer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls onFatal with drive_403 when the probe returns 403", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("drive_403");
  });

  it("calls onFatal with drive_429 when the probe returns 429", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("drive_429");
  });

  it("calls onFatal with error for any other Drive status", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("error");
  });

  it("calls onFatal with network when the probe rejects", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("network");
  });

  it("shows the last failure reason in the debug strip", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={vi.fn()} native={false} />);
    await dispatchError();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(document.body.textContent ?? "").toContain("drive_403");
  });

  it("never loops: onFatal is idempotent", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false} />);
    await dispatchError();
    await dispatchError();
    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});
