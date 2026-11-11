/* Handle to the shell's WebView.
 *
 * Native screens (the player) live next to the WebView in the same native
 * stack, so they need a way to talk back to the page. The shell registers
 * its WebView here; the player injects the message into the page.
 */

import type { WebView } from "react-native-webview";
import { nativeToWebScript } from "./bridge";

/** react-native-webview 14 exposes the instance through the component type. */
export type ShellWebView = React.ComponentRef<typeof WebView>;

let shellWebView: ShellWebView | null = null;

export function setShellWebView(ref: ShellWebView | null): void {
  shellWebView = ref;
}

export function getShellWebView(): ShellWebView | null {
  return shellWebView;
}

/** Push a native → web message into the page (no-op when the shell is gone). */
export function sendToWeb(payload: unknown): boolean {
  const webView = shellWebView;
  if (!webView) return false;
  try {
    webView.injectJavaScript(nativeToWebScript(payload));
    return true;
  } catch {
    return false;
  }
}
