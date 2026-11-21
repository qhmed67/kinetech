/* Hybrid shell configuration (2027-architecture.md §2).
 *
 * The UI is the EXISTING web app rendered inside a WebView — the shell owns
 * no screens of its own beyond the protected player, the blocked screen and
 * (phase 4) offline downloads. Everything the web app needs is served by
 * apps/web; native only receives ids over the bridge, never URLs or tokens.
 */

export const BRIDGE_VERSION = 1;

/** Production web app the shell loads. */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://kinetechtest.vercel.app";

/** Origin of that web app — the only origin the bridge trusts. */
export const WEB_ORIGIN = new URL(WEB_URL).origin;

/** Origins the WebView may navigate to; everything else opens in the system browser. */
export const ALLOWED_ORIGINS = [WEB_ORIGIN];

/** Deep-link scheme of the shell (app.json). */
export const APP_SCHEME = "kinetech";
