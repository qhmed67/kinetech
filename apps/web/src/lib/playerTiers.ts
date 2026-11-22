/** Pure tier-selection logic for the lesson playback chain.
 *
 * Chain: Worker → Direct Drive → YouTube (forward-only, never loops).
 * A lesson without a Drive file goes Worker-less straight to YouTube.
 */

export type LessonTier = "worker" | "direct" | "youtube";

/** What the Worker tier becomes when a lesson loads:
 *  - Worker tier granted (server signed) and no worker-fail marker → "worker"
 *  - fresh worker-fail marker (~10 min) → "direct" (skip to Direct via loadDirect)
 *  - anything else → "youtube" (no Drive file → straight to YouTube, as before) */
export function tierAfterGrant(opts: {
  workerMode: boolean;
  workerSrc: boolean;
  markerFresh: boolean;
}): LessonTier {
  if (opts.workerMode && opts.workerSrc) return opts.markerFresh ? "direct" : "worker";
  return "youtube";
}

/** Worker tier died → Direct when available, else YouTube. */
export function tierAfterWorkerFailure(opts: { canDirect: boolean }): "direct" | "youtube" {
  return opts.canDirect ? "direct" : "youtube";
}

/** Direct Drive tier died (video.error, 403/429, stall) → YouTube. */
export function tierAfterDirectFailure(): "youtube" {
  return "youtube";
}
