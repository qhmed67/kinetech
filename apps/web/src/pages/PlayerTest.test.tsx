import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PlayerTestPage, PLAYER_TEST_FILE_ID } from "./PlayerTest";

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

describe("PlayerTestPage", () => {
  it("shows a clear message when VITE_DRIVE_BROWSER_KEY is missing", () => {
    vi.stubEnv("VITE_DRIVE_BROWSER_KEY", "");
    render(<PlayerTestPage />);
    expect(screen.getByText(/VITE_DRIVE_BROWSER_KEY is not set/i)).toBeTruthy();
    vi.unstubAllEnvs();
  });

  it("renders the Plyr video with the Drive API URL when the key is set", async () => {
    vi.stubEnv("VITE_DRIVE_BROWSER_KEY", "AIzaTestKey");
    const { container } = render(<PlayerTestPage />);
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toContain(PLAYER_TEST_FILE_ID);
    expect(video?.getAttribute("src")).toContain("alt=media");
    expect(video?.getAttribute("src")).toContain("supportsAllDrives=true");
    expect(video?.getAttribute("playsinline")).toBe("");
    expect(video?.getAttribute("disablepictureinpicture")).toBe("");
    // Let the debug poll reflect media events + wait for the strip.
    await act(async () => {
      video?.dispatchEvent(new Event("canplay"));
      video?.dispatchEvent(new Event("loadedmetadata"));
      await new Promise((r) => setTimeout(r, 700));
    });
    const text = container.textContent ?? "";
    expect(text).toContain("srcHost");
    expect(text).toContain("videoWidth×videoHeight");
    expect(text).toContain("timeToCanplay");
    expect(text).toContain("readyState");
    expect(text).not.toContain("AIzaTestKey");
    expect(text).not.toContain("key=");
    vi.unstubAllEnvs();
  });

  it("defaults the fid to the clear test constant", () => {
    expect(PLAYER_TEST_FILE_ID).toBe("1a0p37O-VASxkdXIt-smWK3tw0x9-Tp7Y");
  });
});
