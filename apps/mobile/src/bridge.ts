/* Native side of the hybrid shell bridge (2027-architecture.md §2.3).
 *
 * Every message that arrives from the WebView is validated before it is
 * used: the sender origin must be on the whitelist and the payload must
 * match the bridge schema. Unknown types are dropped. Nothing the web sends
 * is ever executed as code or used as a path.
 */

import {
  isWebToNative,
  parseMessage,
  type WebToNative,
} from "@kinetech/bridge";
import { ALLOWED_ORIGINS } from "./config";

type Handler = (message: WebToNative) => void;

const handlers = new Set<Handler>();

/** True when the URL belongs to an origin the shell trusts. */
export function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.includes(parsed.origin);
  } catch {
    return false;
  }
}

/** Subscribe to validated web → native messages. */
export function onWebMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Validate + dispatch a message that came from the WebView.
 * `raw` is the postMessage payload, `url` the page it came from.
 */
export function handleWebMessage(raw: string, url: string): boolean {
  if (!isAllowedOrigin(url)) return false;
  const message = parseMessage(raw);
  if (!message || !isWebToNative(message)) return false;
  for (const handler of handlers) {
    try {
      handler(message);
    } catch {
      /* a broken handler must not break the bridge */
    }
  }
  return true;
}

/**
 * Script injected into the page so the web can receive native → web
 * messages. It only parses JSON and dispatches a DOM event.
 */
export const RECEIVER_SCRIPT = `
(function () {
  if (window.__KT_NATIVE__) return;
  window.__KT_NATIVE__ = true;
  window.__KT_RECV__ = function (payload) {
    try {
      var message = JSON.parse(payload);
      window.dispatchEvent(new CustomEvent('kt:native', { detail: message }));
    } catch (e) {}
  };
})();
true;
`;

/** Build the script that pushes one native → web message into the page. */
export function nativeToWebScript(payload: unknown): string {
  const json = JSON.stringify(payload);
  return `window.__KT_RECV__ && window.__KT_RECV__(${JSON.stringify(json)}); true;`;
}
