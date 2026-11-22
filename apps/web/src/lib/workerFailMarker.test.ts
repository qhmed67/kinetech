import { afterEach, describe, expect, it } from "vitest";
import {
  clearWorkerFailMarker,
  isWorkerFailFresh,
  setWorkerFailMarker,
  workerFailAgeMs,
  WORKER_FAIL_TTL_MS,
} from "./workerFailMarker";

function id(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("workerFailMarker", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("records a fresh failure and is cleared", () => {
    const id_ = id();
    expect(isWorkerFailFresh(id_)).toBe(false);
    expect(workerFailAgeMs(id_)).toBe(null);
    setWorkerFailMarker(id_);
    expect(isWorkerFailFresh(id_)).toBe(true);
    expect(workerFailAgeMs(id_) ?? -1).toBeGreaterThanOrEqual(0);
    clearWorkerFailMarker(id_);
    expect(isWorkerFailFresh(id_)).toBe(false);
    expect(workerFailAgeMs(id_)).toBe(null);
  });

  it("is stale once the ~10-minute window passes", () => {
    const id_ = id();
    try {
      // Simulate a marker older than the TTL (private mode etc. — helpers
      // must not throw, the marker is an optimization).
      window.localStorage.setItem(`kt-worker-fail-${id_}`, String(Date.now() - WORKER_FAIL_TTL_MS - 1000));
    } catch {
      /* storage unavailable — covered above */
    }
    expect(isWorkerFailFresh(id_)).toBe(false);
  });

  it("tolerates corrupted values", () => {
    const id_ = id();
    try {
      window.localStorage.setItem(`kt-worker-fail-${id_}`, "not-a-number");
    } catch {
      /* ignore */
    }
    expect(isWorkerFailFresh(id_)).toBe(false);
    expect(workerFailAgeMs(id_)).toBe(null);
  });
});
