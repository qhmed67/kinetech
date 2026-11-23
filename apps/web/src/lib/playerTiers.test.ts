import { describe, expect, it } from "vitest";
import {
  INITIAL_TIER_STATE,
  isTerminal,
  nextTierAfterFailure,
  tierReducer,
  tierAfterGrant,
  tierAfterDirectFailure,
  tierAfterWorkerFailure,
  isDriveLessonEmbed,
  lessonIsDrive,
  type TierState,
} from "./playerTiers";

const grant = (o: Partial<Parameters<typeof tierReducer>[1] & { type: "GRANT" }> = {}) =>
  ({
    type: "GRANT",
    workerMode: true,
    workerSrc: true,
    markerFresh: false,
    hasDriveFile: true,
    youtubeAvailable: true,
    ...o,
  }) as Parameters<typeof tierReducer>[1];

const fail = (o: Partial<{ reason: string; canDirect: boolean; youtubeAvailable: boolean }> = {}) =>
  ({
    type: "TIER_FAILED",
    reason: "stall",
    canDirect: true,
    youtubeAvailable: true,
    ...o,
  }) as Parameters<typeof tierReducer>[1];

function run(events: Parameters<typeof tierReducer>[1][]): TierState {
  return events.reduce(tierReducer, INITIAL_TIER_STATE);
}

describe("tierReducer — first tier on grant", () => {
  it("starts on Worker when the server signed a stream", () => {
    expect(run([grant()]).tier).toBe("worker");
  });

  it("starts on Direct when a fresh worker-fail marker exists", () => {
    const s = run([grant({ markerFresh: true })]);
    expect(s.tier).toBe("direct");
    expect(s.reason).toBe("worker_marker");
  });

  it("starts on Direct for a Drive lesson with NO Worker grant (env-less deployment)", () => {
    // This is the production case before the Worker env was set: no Worker
    // grant, but the lesson has a Drive file. Direct must be tried first.
    const s = run([grant({ workerMode: false, workerSrc: false })]);
    expect(s.tier).toBe("direct");
  });

  it("starts on YouTube when there is no Drive file", () => {
    const s = run([grant({ workerMode: false, workerSrc: false, hasDriveFile: false })]);
    expect(s.tier).toBe("youtube");
  });
});

describe("tierReducer — forward-only chain", () => {
  it("Worker → Direct on failure", () => {
    const s = run([grant(), fail({ reason: "stall" })]);
    expect(s.tier).toBe("direct");
    expect(s.history.map((h) => h.tier)).toEqual(["worker", "direct"]);
    expect(s.history[1].reason).toBe("stall");
  });

  it("Direct → YouTube on failure", () => {
    const s = run([grant(), fail(), fail({ reason: "drive_403" })]);
    expect(s.tier).toBe("youtube");
    expect(s.history.map((h) => h.tier)).toEqual(["worker", "direct", "youtube"]);
  });

  it("YouTube failing with no tier left → terminal", () => {
    const s = run([grant(), fail(), fail(), fail({ reason: "yt_error" })]);
    expect(s.tier).toBe("terminal");
    expect(isTerminal(s)).toBe(true);
    expect(s.reason).toBe("yt_error");
  });

  it("Worker → YouTube directly when Direct is unavailable", () => {
    const s = run([grant(), fail({ canDirect: false })]);
    expect(s.tier).toBe("youtube");
  });

  it("Worker → terminal directly when neither Direct nor YouTube exists", () => {
    const s = run([grant(), fail({ canDirect: false, youtubeAvailable: false })]);
    expect(s.tier).toBe("terminal");
  });

  it("a Drive lesson with no YouTube version goes terminal after Direct fails", () => {
    const s = run([grant({ workerMode: false, workerSrc: false }), fail({ youtubeAvailable: false })]);
    expect(s.tier).toBe("terminal");
  });
});

describe("tierReducer — never loops", () => {
  it("terminal is sticky and ignores further failures", () => {
    const s = run([grant(), fail(), fail(), fail(), fail(), fail()]);
    expect(s.tier).toBe("terminal");
    expect(s.history.filter((h) => h.tier === "terminal")).toHaveLength(1);
  });

  it("ignores a late failure from the tier it already left", () => {
    // The old player can emit one more error while being torn down.
    const s = tierReducer(
      { tier: "terminal", history: [{ tier: "terminal", reason: "x" }], reason: "x" },
      fail(),
    );
    expect(s.tier).toBe("terminal");
    expect(s.history).toHaveLength(1);
  });

  it("history is append-only, so a loop would be visible", () => {
    const s = run([grant(), fail(), fail(), fail()]);
    expect(s.history).toHaveLength(4);
  });

  it("RETRY restarts from the first tier", () => {
    const s = tierReducer(run([grant(), fail(), fail(), fail()]), {
      type: "RETRY",
      workerMode: true,
      workerSrc: true,
      hasDriveFile: true,
      youtubeAvailable: true,
    });
    expect(s.tier).toBe("worker");
    expect(s.history).toEqual([{ tier: "worker", reason: "retry" }]);
  });
});

describe("nextTierAfterFailure", () => {
  it("is total over every tier and availability combination", () => {
    const tiers = ["worker", "direct", "youtube", "terminal"] as const;
    for (const t of tiers) {
      for (const canDirect of [true, false]) {
        for (const youtubeAvailable of [true, false]) {
          const next = nextTierAfterFailure(t, { canDirect, youtubeAvailable });
          expect(next === null || ["worker", "direct", "youtube"].includes(next)).toBe(true);
        }
      }
    }
  });
});

describe("legacy helpers stay consistent with the reducer", () => {
  it("tierAfterGrant matches the reducer", () => {
    expect(tierAfterGrant({ workerMode: true, workerSrc: true, markerFresh: false })).toBe("worker");
    expect(tierAfterGrant({ workerMode: true, workerSrc: true, markerFresh: true })).toBe("direct");
    expect(
      tierAfterGrant({ workerMode: false, workerSrc: false, markerFresh: false, hasDriveFile: true }),
    ).toBe("direct");
    expect(tierAfterGrant({ workerMode: false, workerSrc: false, markerFresh: false })).toBe(
      "youtube",
    );
  });

  it("tierAfterWorkerFailure / tierAfterDirectFailure are unchanged", () => {
    expect(tierAfterWorkerFailure({ canDirect: true })).toBe("direct");
    expect(tierAfterWorkerFailure({ canDirect: false })).toBe("youtube");
    expect(tierAfterDirectFailure()).toBe("youtube");
  });
});

describe("isDriveLessonEmbed", () => {
  const driveEmbed = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz01234/preview";

  it("classifies a Drive preview embed as a Drive lesson", () => {
    expect(isDriveLessonEmbed(driveEmbed, null)).toBe(true);
  });

  it("classifies a YouTube embed as NOT a Drive lesson", () => {
    expect(
      isDriveLessonEmbed("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ).toBe(false);
  });

  it("classifies a legacy mp4 seed and a null embed as NOT a Drive lesson", () => {
    expect(isDriveLessonEmbed("https://cdn.example.com/lesson.mp4", null)).toBe(false);
    expect(isDriveLessonEmbed(null, null)).toBe(false);
  });
});

describe("lessonIsDrive — the lesson kind must not change with the active tier", () => {
  const drivePreview = "https://drive.google.com/file/d/ABC123/preview";
  const ytEmbed = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

  it("stays true for a Drive lesson while the Worker tier is active", () => {
    // Regression: the old expression excluded mode "worker", so Worker→Direct
    // was skipped because canDirect was computed from a false isDrive.
    expect(lessonIsDrive(true, drivePreview)).toBe(true);
  });

  it("stays true after the grant switches to the Direct tier", () => {
    expect(lessonIsDrive(true, drivePreview)).toBe(true);
  });

  it("stays true after the embed was swapped for the YouTube fallback", () => {
    // Otherwise a failed Direct lesson fell into <video src=drive-preview>,
    // which plays nothing — the player looked like it had disappeared.
    expect(lessonIsDrive(true, ytEmbed)).toBe(true);
  });

  it("falls back to the embed for pre-flag grants", () => {
    expect(lessonIsDrive(undefined, drivePreview)).toBe(true);
    expect(lessonIsDrive(undefined, ytEmbed)).toBe(false);
    expect(lessonIsDrive(undefined, "https://cdn.example.com/a.mp4")).toBe(false);
    expect(lessonIsDrive(undefined, null)).toBe(false);
  });
});
