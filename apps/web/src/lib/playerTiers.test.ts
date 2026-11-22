import { describe, expect, it } from "vitest";
import {
  tierAfterGrant,
  tierAfterWorkerFailure,
  tierAfterDirectFailure,
} from "./playerTiers";

describe("tierAfterGrant", () => {
  it("starts on the Worker tier when the server granted one", () => {
    expect(tierAfterGrant({ workerMode: true, workerSrc: true, markerFresh: false })).toBe("worker");
  });

  it("skips straight to Direct when the worker-fail marker is fresh", () => {
    expect(tierAfterGrant({ workerMode: true, workerSrc: true, markerFresh: true })).toBe("direct");
  });

  it("falls back to the Drive iframe for embed grants", () => {
    expect(tierAfterGrant({ workerMode: false, workerSrc: false, markerFresh: false })).toBe("drive");
  });
});

describe("tierAfterWorkerFailure", () => {
  it("goes Direct when available, Drive iframe otherwise", () => {
    expect(tierAfterWorkerFailure({ canDirect: true })).toBe("direct");
    expect(tierAfterWorkerFailure({ canDirect: false })).toBe("drive");
  });
});

describe("tierAfterDirectFailure", () => {
  it("goes to the Drive iframe — the chain never loops", () => {
    expect(tierAfterDirectFailure()).toBe("drive");
  });
});
