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

/** Whether a lesson's ORIGINAL grant opens a Google Drive source — i.e. this
 *  lesson goes through the Worker / Direct tiers.
 *
 *  Must be decided once, from the initial grant, and then carried on the
 *  grant object. The chain replaces `embedUrl` with a youtube-nocookie link
 *  when Direct dies; re-deriving the lesson kind from the live embed would
 *  reclassify it as a YouTube lesson, which drops it into the generic
 *  `!isYt` <video> branch and shows "Video unavailable".
 */
export function isDriveLessonEmbed(embedUrl: string | null, youtubeId: string | null): boolean {
  if (embedUrl === null) return false;
  if (youtubeId !== null) return false;
  return /drive\.google\.com/.test(embedUrl);
}
