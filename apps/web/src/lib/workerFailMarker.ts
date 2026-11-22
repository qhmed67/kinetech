/* Worker-fail marker: after a Worker-tier failure the next ~10 minutes of
 * lessons skip the Worker tier and play through Drive directly, so one bad
 * Worker doesn't chain across the lesson chain.
 *
 * Best-effort everywhere: private mode, quota, full storage — the marker is
 * an optimization, never a requirement. Cleared when the Worker is healthy
 * again (first successful frame) or by the debug-strip toggle.
 */

export const WORKER_FAIL_TTL_MS = 10 * 60 * 1000;

function workerFailKey(videoId: string): string {
  return `kt-worker-fail-${videoId}`;
}

export function readWorkerFailMarker(videoId: string): number {
  try {
    const raw = localStorage.getItem(workerFailKey(videoId));
    const t = typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

export function isWorkerFailFresh(videoId: string): boolean {
  const t = readWorkerFailMarker(videoId);
  return t > 0 && Date.now() - t < WORKER_FAIL_TTL_MS;
}

/** Age of the marker in ms, or null when there is none. */
export function workerFailAgeMs(videoId: string): number | null {
  const t = readWorkerFailMarker(videoId);
  return t > 0 ? Math.max(0, Date.now() - t) : null;
}

export function setWorkerFailMarker(videoId: string): void {
  try {
    localStorage.setItem(workerFailKey(videoId), String(Date.now()));
  } catch {
    /* storage unavailable — fine, the tier still falls back to Drive */
  }
}

export function clearWorkerFailMarker(videoId: string): void {
  try {
    localStorage.removeItem(workerFailKey(videoId));
  } catch {
    /* ignore */
  }
}
