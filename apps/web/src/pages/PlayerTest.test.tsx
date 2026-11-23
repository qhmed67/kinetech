import { afterEach, beforeAll, describe, expect, it } from "vitest";
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

afterEach(() => {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

function typeKey(key: string) {
  const input = screen.getByLabelText(/drive api key/i) as HTMLInputElement;
  const form = input.closest("form") as HTMLFormElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, key);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("PlayerTestPage", () => {
  it("asks for the key instead of embedding one in the bundle", () => {
    // No key comes from the build any more, so the page must prompt.
    render(<PlayerTestPage />);
    expect(screen.getByLabelText(/drive api key/i)).toBeTruthy();
    expect(screen.getByText(/never part of/i)).toBeTruthy();
    // It must not have rendered a player with an empty/undefined key.
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders the Plyr video with the Drive API URL once a key is supplied", async () => {
    const { container } = render(<PlayerTestPage />);
    typeKey("AIzaTestKey");
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toContain(PLAYER_TEST_FILE_ID);
    expect(video?.getAttribute("src")).toContain("alt=media");
    expect(video?.getAttribute("src")).toContain("supportsAllDrives=true");
    expect(video?.getAttribute("playsinline")).toBe("");
    expect(video?.getAttribute("disablepictureinpicture")).toBe("");
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
    // The key must never be displayed by the debug strip.
    expect(text).not.toContain("AIzaTestKey");
    expect(text).not.toContain("key=");
  });

  it("defaults the fid to the clear test constant", () => {
    expect(PLAYER_TEST_FILE_ID).toBe("1a0p37O-VASxkdXIt-smWK3tw0x9-Tp7Y");
  });
});
