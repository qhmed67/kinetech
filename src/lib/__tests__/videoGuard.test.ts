import { describe, expect, it } from "vitest";
import {
  deobfuscateId,
  extractYoutubeId,
  formatClock,
  isDriveSource,
  isYoutubeSource,
  obfuscateId,
  probeVideoDurationSecs,
} from "../videoGuard";

describe("obfuscateId round-trip", () => {
  it("recovers the original id and never contains it plainly", () => {
    const id = "dQw4w9WgXcQ";
    const enc = obfuscateId(id);
    expect(enc).not.toContain(id);
    expect(deobfuscateId(enc)).toBe(id);
  });
});

describe("extractYoutubeId", () => {
  it("parses watch, short, embed, shorts URLs and bare ids", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-youtube sources", () => {
    expect(extractYoutubeId("assets/vid.mp4")).toBeNull();
    expect(extractYoutubeId("https://cdn.example.com/v.mp4")).toBeNull();
    expect(isYoutubeSource("assets/vid.mp4")).toBe(false);
    expect(isYoutubeSource("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });
});

describe("isDriveSource", () => {
  it("accepts drive share links, never youtube", () => {
    expect(isDriveSource("https://drive.google.com/file/d/ABC123_xyz/view?usp=sharing")).toBe(true);
    expect(isDriveSource("https://drive.google.com/open?id=ABC123")).toBe(true);
    expect(isDriveSource("https://youtu.be/dQw4w9WgXcQ")).toBe(false);
    expect(isDriveSource("https://cdn.example.com/v.mp4")).toBe(false);
    expect(isDriveSource("")).toBe(false);
  });
});

describe("probeVideoDurationSecs", () => {
  it("returns null for blanks and unknown links", async () => {
    await expect(probeVideoDurationSecs("")).resolves.toBeNull();
    await expect(probeVideoDurationSecs("https://cdn.example.com/v.mp4")).resolves.toBeNull();
  });

  it("times out cleanly instead of hanging", async () => {
    await expect(
      probeVideoDurationSecs("https://drive.google.com/file/d/ABC123/view?usp=sharing", 50),
    ).resolves.toBeNull();
  });
});

describe("formatClock", () => {
  it("formats mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });
});
