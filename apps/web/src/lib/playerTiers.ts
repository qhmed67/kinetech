/** Pure tier-selection logic for the lesson playback chain.
 *
 * Chain: Worker → Direct Drive → YouTube → terminal (visible error card).
 * Forward-only, never loops. A lesson without a Drive file goes
 * Worker-less straight to the tier that can play it.
 *
 * This module is the SINGLE source of truth for "which tier plays next".
 * The React component only renders the tier this machine names and reports
 * outcomes back — it must never decide a transition itself, and it must never
 * unmount or hide the player except in `terminal`.
 */

export type LessonTier = "worker" | "direct" | "youtube" | "terminal";

/** One recorded hop, newest last. `reason` is a short non-secret label. */
export type TierStep = { tier: LessonTier; reason: string | null };

export type TierState = {
  tier: LessonTier;
  /** Every tier this session has been through, oldest first. */
  history: TierStep[];
  /** Why the CURRENT tier is active (null for the first granted tier). */
  reason: string | null;
};

export type TierEvent =
  | {
      type: "GRANT";
      /** The server signed a Worker stream for this lesson. */
      workerMode: boolean;
      workerSrc: boolean;
      /** A fresh worker-fail marker says "skip the Worker this time". */
      markerFresh: boolean;
      /** The lesson has a Drive file, so Direct can serve it. */
      hasDriveFile: boolean;
      youtubeAvailable: boolean;
    }
  | {
      type: "TIER_FAILED";
      /** Non-secret label: stall | http_403 | quota | error | network … */
      reason: string;
      /** Direct is usable for this lesson (Drive file + browser key). */
      canDirect: boolean;
      youtubeAvailable: boolean;
    }
  | {
      type: "RETRY";
      workerMode: boolean;
      workerSrc: boolean;
      hasDriveFile: boolean;
      youtubeAvailable: boolean;
      /** A retry always clears the skip marker. */
      markerFresh?: boolean;
    };

/** Initial state before any grant: nothing may render but a spinner. */
export const INITIAL_TIER_STATE: TierState = {
  tier: "youtube",
  history: [],
  reason: "initial",
};

function step(tier: LessonTier, reason: string | null): TierState {
  return { tier, history: [{ tier, reason }], reason };
}

/** First tier for a fresh grant. */
function firstTier(opts: {
  workerMode: boolean;
  workerSrc: boolean;
  markerFresh: boolean;
  hasDriveFile: boolean;
}): LessonTier {
  if (opts.workerMode && opts.workerSrc) return opts.markerFresh ? "direct" : "worker";
  // No Worker grant: a Drive lesson is still playable through Direct, and that
  // must be tried BEFORE YouTube (Direct is protected, YouTube is the last
  // resort). This is the case a deployment without the Worker env hits.
  return opts.hasDriveFile ? "direct" : "youtube";
}

/** Where a failed tier goes next. Returns `null` when nothing is left. */
export function nextTierAfterFailure(
  from: LessonTier,
  opts: { canDirect: boolean; youtubeAvailable: boolean },
): LessonTier | null {
  switch (from) {
    case "worker":
      if (opts.canDirect) return "direct";
      return opts.youtubeAvailable ? "youtube" : null;
    case "direct":
      return opts.youtubeAvailable ? "youtube" : null;
    case "youtube":
      return null;
    case "terminal":
      return null;
  }
}

/** The reducer. Pure: no timers, no DOM, no network. */
export function tierReducer(state: TierState, event: TierEvent): TierState {
  switch (event.type) {
    case "GRANT": {
      const tier = firstTier(event);
      // A marker-fresh skip is worth recording so the debug strip explains it.
      const reason = tier === "direct" && event.markerFresh && event.workerMode ? "worker_marker" : null;
      return step(tier, reason);
    }
    case "TIER_FAILED": {
      if (state.tier === "terminal") return state; // terminal is sticky
      // Ignore a duplicate failure from the tier we already left (the old
      // player may still emit one error while it is being torn down).
      const last = state.history[state.history.length - 1];
      if (last && last.tier !== state.tier) return state;
      const next = nextTierAfterFailure(state.tier, {
        canDirect: event.canDirect,
        youtubeAvailable: event.youtubeAvailable,
      });
      if (next === null) {
        return {
          tier: "terminal",
          history: [...state.history, { tier: "terminal", reason: event.reason }],
          reason: event.reason,
        };
      }
      return {
        tier: next,
        history: [...state.history, { tier: next, reason: event.reason }],
        reason: event.reason,
      };
    }
    case "RETRY":
      return step(firstTier({ markerFresh: false, ...event }), "retry");
  }
}

/** True only when nothing is left to try. The ONLY state in which the player
 *  may be replaced by an error card. */
export function isTerminal(state: TierState): boolean {
  return state.tier === "terminal";
}

/* ------------------------------------------------------------------ *
 * Legacy helpers kept for callers/tests that predate the reducer.
 * They now defer to the same rules so there is one policy, not two.
 * ------------------------------------------------------------------ */

export function tierAfterGrant(opts: {
  workerMode: boolean;
  workerSrc: boolean;
  markerFresh: boolean;
  hasDriveFile?: boolean;
}): LessonTier {
  return firstTier({ ...opts, hasDriveFile: opts.hasDriveFile === true });
}

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

/** Whether the CURRENT lesson is a Drive lesson — a property of the lesson,
 *  not of whichever tier is active or what the embed currently holds.
 *
 *  Prefer the flag captured at grant time. The embed fallback exists only for
 *  grants created before that flag existed. It must NOT look at `mode`: an
 *  earlier version excluded mode "worker"/"direct", which made a Drive lesson
 *  look non-Drive exactly while the Worker or Direct tier was active — so
 *  Worker→Direct was skipped and a failed Direct lesson fell into the raw
 *  `<video src=drive-preview-URL>` branch and rendered nothing.
 */
export function lessonIsDrive(grantIsDrive: boolean | undefined, embedUrl: string | null): boolean {
  if (grantIsDrive === true) return true;
  if (embedUrl === null) return false;
  if (/youtube(-nocookie)?\.com/.test(embedUrl)) return false;
  return /drive\.google\.com/.test(embedUrl);
}
