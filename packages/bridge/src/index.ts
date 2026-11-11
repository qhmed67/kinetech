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
  | { v: 1; type: "downloadLesson"; lessonId: string };

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
    message.type === "downloadLesson"
  );
}

export function isNativeToWeb(message: BridgeMessage): message is NativeToWeb {
  return (
    message.type === "playerClosed" ||
    message.type === "deviceStatus" ||
    message.type === "downloadState"
  );
}
