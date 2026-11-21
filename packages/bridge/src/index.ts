/* Typed, versioned messages between the web UI and the native shell
 * (2027-architecture.md §2.3).
 *
 * Rules that both sides MUST honour:
 *   1. Messages carry ids only — never a URL, a token, a licence or a path.
 *   2. The version must match, unknown types are dropped, and a malformed
 *      payload is never partially executed.
 *   3. Nothing a peer sends is ever evaluated as code or used as a path.
 */

export const BRIDGE_VERSION = 1;

export type WebToNative =
  | { v: 1; type: "playVideo"; lessonId: string }
  | { v: 1; type: "authCode"; code: string }
  | { v: 1; type: "logout" }
  | { v: 1; type: "downloadLesson"; lessonId: string }
  /**
   * The identity the native layer floats over the playback (the page got it
   * from the server grant — the native side never asks for it again, so no
   * extra view is burned).
   */
  | { v: 1; type: "watermark"; email: string; phoneLast4: string };

export type NativeToWeb =
  | { v: 1; type: "playerClosed"; lessonId: string; progressSec: number }
  | { v: 1; type: "deviceStatus"; ok: boolean; reason?: string }
  | { v: 1; type: "downloadState"; lessonId: string; state: "queued" | "done" | "failed" };

export type BridgeMessage = WebToNative | NativeToWeb;

/** Custom event the shell dispatches inside the page for native → web. */
export const NATIVE_EVENT = "kt:native";

/** Flag the shell injects before the page content loads. */
export const NATIVE_FLAG = "__KT_NATIVE__";

/** User-Agent marker the shell appends (a hint only, never trusted alone). */
export const NATIVE_UA_MARK = "KineTechApp/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Parse + validate a raw payload (string or object) from the peer side. */
export function parseMessage(raw: unknown): BridgeMessage | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(data)) return null;
  if (data.v !== BRIDGE_VERSION) return null;
  const type = data.type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "playVideo":
    case "downloadLesson":
      return isNonEmptyString(data.lessonId)
        ? { v: 1, type, lessonId: data.lessonId }
        : null;
    case "authCode":
      return isNonEmptyString(data.code) ? { v: 1, type, code: data.code } : null;
    case "watermark":
      return typeof data.email === "string" && typeof data.phoneLast4 === "string"
        ? { v: 1, type, email: data.email, phoneLast4: data.phoneLast4 }
        : null;
    case "logout":
      return { v: 1, type };
    case "playerClosed":
      return isNonEmptyString(data.lessonId) && typeof data.progressSec === "number"
        ? { v: 1, type, lessonId: data.lessonId, progressSec: data.progressSec }
        : null;
    case "deviceStatus":
      return typeof data.ok === "boolean"
        ? {
            v: 1,
            type,
            ok: data.ok,
            reason: typeof data.reason === "string" ? data.reason : undefined,
          }
        : null;
    case "downloadState":
      return isNonEmptyString(data.lessonId) &&
        (data.state === "queued" || data.state === "done" || data.state === "failed")
        ? { v: 1, type, lessonId: data.lessonId, state: data.state }
        : null;
    default:
      // Unknown types are dropped — never forwarded, never executed.
      return null;
  }
}

export function isWebToNative(message: BridgeMessage): message is WebToNative {
  return (
    message.type === "playVideo" ||
    message.type === "authCode" ||
    message.type === "logout" ||
    message.type === "downloadLesson" ||
    message.type === "watermark"
  );
}

export function isNativeToWeb(message: BridgeMessage): message is NativeToWeb {
  return (
    message.type === "playerClosed" ||
    message.type === "deviceStatus" ||
    message.type === "downloadState"
  );
}

/* ---------------------------------------------------------------------------
 * Playback grant (native side only).
 *
 * The grant is issued by the server for ONE device and ONE lesson. It carries
 * a short-lived media URL — it must never travel to the WebView, never be
 * logged and never be rendered to the student.
 * ------------------------------------------------------------------------- */

export type PlaybackGrant = {
  /** Short-lived media URL for the native player. */
  url: string;
  /** ISO timestamp when the URL stops working. */
  expiresAt: string;
  /** Watermark identity (email + last 4 of the phone). */
  email: string;
  phoneLast4: string;
  /** Lesson length in minutes (server truth). */
  minutes: number;
  /** Views left for this lesson (server truth). */
  viewsLeft: number;
  /** The device the grant was issued for. */
  deviceId: string;
};

/** Codes the server answers with when a native playback cannot start. */
export type PlaybackDenied =
  | "INVALID_TOKEN"
  | "SESSION_MISMATCH"
  | "BANNED"
  | "NOT_ENROLLED"
  | "VIEW_CAP"
  | "RATE_LIMITED"
  | "SUSPICIOUS_DENY"
  | "NOT_FOUND"
  | "VIDEO_MISSING"
  | "NO_PROFILE"
  | "NATIVE_UNSUPPORTED_SOURCE"
  | "SERVER_ERROR";

export type PlaybackResult =
  | { ok: true; grant: PlaybackGrant }
  | { ok: false; code: PlaybackDenied; ar: string; en: string };

/** Validate the server answer before it reaches the player. */
export function parsePlaybackResult(raw: unknown): PlaybackResult | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(data)) return null;
  if (data.ok === false) {
    const code = typeof data.code === "string" ? data.code : "SERVER_ERROR";
    return {
      ok: false,
      code: code as PlaybackDenied,
      ar: typeof data.ar === "string" ? data.ar : "",
      en: typeof data.en === "string" ? data.en : "",
    };
  }
  if (data.ok !== true) return null;
  if (!isRecord(data.grant)) return null;
  const g = data.grant;
  if (!isNonEmptyString(g.url)) return null;
  if (typeof g.expiresAt !== "string") return null;
  if (typeof g.email !== "string" || typeof g.phoneLast4 !== "string") return null;
  if (typeof g.minutes !== "number" || typeof g.viewsLeft !== "number") return null;
  if (typeof g.deviceId !== "string") return null;
  return {
    ok: true,
    grant: {
      url: g.url,
      expiresAt: g.expiresAt,
      email: g.email,
      phoneLast4: g.phoneLast4,
      minutes: g.minutes,
      viewsLeft: g.viewsLeft,
      deviceId: g.deviceId,
    },
  };
}
