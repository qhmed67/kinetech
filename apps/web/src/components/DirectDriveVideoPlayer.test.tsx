import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DirectDriveVideoPlayer } from "./DirectDriveVideoPlayer";

const SRC = "https://www.googleapis.com/drive/v3/files/f1?alt=media&key=AIzaTest&supportsAllDrives=true";
const BASE_PROPS = {
  src: SRC,
  onFatal: vi.fn(),
  native: false,
  playerState: "normal" as const,
  onExpand: vi.fn(),
  onCollapse: vi.fn(),
  safeInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
};

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

describe("DirectDriveVideoPlayer — box and overlays", () => {
  it("keeps a non-zero box: every child is absolute, so the root needs a height", () => {
    render(<DirectDriveVideoPlayer src={SRC} onFatal={vi.fn()} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    const root = document.querySelector(".pvp-direct") as HTMLElement;
    expect(root).toBeTruthy();
    // Regression: without a height the Direct tier collapsed to 0px and the
    // video looked like it had disappeared, with no fallback triggered.
    expect(root.className).toContain("aspect-video");
  });

  it("renders the identity watermark above the video", () => {
    render(
      <DirectDriveVideoPlayer
        src={SRC}
        onFatal={vi.fn()}
        native={false}
        watermark={<div data-testid="wm">student@example.com</div>}
        playerState="normal"
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })}
      />,
    );
    expect(document.querySelector('[data-testid="wm"]')).toBeTruthy();
    expect(document.body.textContent ?? "").toContain("student@example.com");
  });

  it("never shows the diagnostic strip to a student", () => {
    render(<DirectDriveVideoPlayer src={SRC} onFatal={vi.fn()} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    // The strip only exists with ?pvpdebug=1. Its markers must be absent.
    expect(document.body.textContent ?? "").not.toContain("readyState");
    expect(document.body.textContent ?? "").not.toContain("networkState");
  });

  it("shows the diagnostic strip when debug is on", async () => {
    render(<DirectDriveVideoPlayer src={SRC} onFatal={vi.fn()} native={false} debugOn  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(document.body.textContent ?? "").toContain("readyState");
  });
});

describe("DirectDriveVideoPlayer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls onFatal with drive_403 when the probe returns 403", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("drive_403");
  });

  it("calls onFatal with drive_429 when the probe returns 429", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("drive_429");
  });

  it("calls onFatal with error for any other Drive status", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("error");
  });

  it("calls onFatal with network when the probe rejects", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await dispatchError();
    expect(onFatal).toHaveBeenCalledWith("network");
  });

  it("shows the last failure reason in the debug strip", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    // The strip is debug-only now, so the test must opt in.
    render(<DirectDriveVideoPlayer src={SRC} onFatal={vi.fn()} native={false} debugOn  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await dispatchError();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(document.body.textContent ?? "").toContain("drive_403");
  });

  it("never loops: onFatal is idempotent", async () => {
    const onFatal = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    render(<DirectDriveVideoPlayer src={SRC} onFatal={onFatal} native={false}  playerState="normal" onExpand={vi.fn()} onCollapse={vi.fn()} safeInsets={() => ({ top: 0, right: 0, bottom: 0, left: 0 })} />);
    await dispatchError();
    await dispatchError();
    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});
