/* Web side of the hybrid shell bridge (2027-architecture.md §2.1).
 *
 * The web app is the UI; it never talks to the native side directly. It
 * posts JSON messages that the shell validates, and listens for the events
 * the shell dispatches back into the page.
 *
 * Detection uses the flag the shell injects before the page content loads
 * (a page cannot set it itself). The User-Agent suffix is only a hint — it
 * can be spoofed by any browser, so it is never trusted on its own.
 */

import {
  NATIVE_EVENT,
  NATIVE_FLAG,
  NATIVE_UA_MARK,
  parseMessage,
  type BridgeMessage,
  type NativeToWeb,
  type WebToNative,
} from "@kinetech/bridge";

declare global {
  interface Window {
    __KT_NATIVE__?: boolean;
    __KT_NATIVE_VERSION__?: number;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/** True when the page runs inside the KineTech native shell. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return window[NATIVE_FLAG] === true;
}

/** Secondary hint only: the shell appends this to the User-Agent. */
export function hasNativeUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(NATIVE_UA_MARK);
}

/** Send a message to the native shell. Returns false when not in the shell. */
export function bridgeSend(message: WebToNative): boolean {
  if (typeof window === "undefined") return false;
  const target = window.ReactNativeWebView;
  if (!target || typeof target.postMessage !== "function") return false;
  try {
    target.postMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

/**
 * Listen for native → web messages of one type.
 * Returns an unsubscribe function.
 */
export function bridgeOn<T extends NativeToWeb["type"]>(
  type: T,
  handler: (message: Extract<NativeToWeb, { type: T }>) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const message = parseMessage(detail) as BridgeMessage | null;
    if (!message) return;
    if (message.type !== type) return;
    handler(message as Extract<NativeToWeb, { type: T }>);
  };
  window.addEventListener(NATIVE_EVENT, listener);
  return () => window.removeEventListener(NATIVE_EVENT, listener);
}
