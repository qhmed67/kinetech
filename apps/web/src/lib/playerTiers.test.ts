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

  it("goes straight to Direct when the worker-fail marker is fresh", () => {
    expect(tierAfterGrant({ workerMode: true, workerSrc: true, markerFresh: true })).toBe("direct");
  });

  it("goes Worker-less to YouTube for lessons without a Worker grant (no Drive file)", () => {
    expect(tierAfterGrant({ workerMode: false, workerSrc: false, markerFresh: false })).toBe("youtube");
  });
});

describe("tierAfterWorkerFailure", () => {
  it("goes Direct when available, YouTube otherwise", () => {
    expect(tierAfterWorkerFailure({ canDirect: true })).toBe("direct");
    expect(tierAfterWorkerFailure({ canDirect: false })).toBe("youtube");
  });
});

describe("tierAfterDirectFailure", () => {
  it("goes straight to YouTube — the chain ends there", () => {
    expect(tierAfterDirectFailure()).toBe("youtube");
  });
});
