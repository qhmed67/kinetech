/** Pure tier-selection logic for the lesson playback chain.
 *
 * Chain: Worker → Direct Drive → Drive iframe → YouTube. Switching is
 * forward-only and never loops.
 */

export type LessonTier = "worker" | "direct" | "drive" | "youtube";

/** What the Worker tier becomes when a lesson loads:
 *  - Worker tier granted (server sign, same grant) → "worker"
 *  - a worker-failure marker is fresh (~10 min) → "direct" (skip straight to
 *    Direct, which resolves its src via /api/play {fallback:"direct"})
 *  - anything else → "drive" */
export function tierAfterGrant(opts: {
  workerMode: boolean;
  workerSrc: boolean;
  markerFresh: boolean;
}): LessonTier {
  if (opts.workerMode && opts.workerSrc) return opts.markerFresh ? "direct" : "worker";
  return "drive";
}

/** Worker tier died → direct if it's available, else straight to the Drive iframe. */
export function tierAfterWorkerFailure(opts: { canDirect: boolean }): "direct" | "drive" {
  return opts.canDirect ? "direct" : "drive";
}

/** Direct Drive tier failed → Drive iframe (YouTube comes next). */
export function tierAfterDirectFailure(): "drive" {
  return "drive";
}
