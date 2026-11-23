/* Hybrid shell configuration (2027-architecture.md §2).
 *
 * The UI is the EXISTING web app rendered inside a WebView — the shell owns
 * no screens of its own beyond the protected player and the blocked screen.
 * Everything the web app needs is served by apps/web; native only receives
 * ids over the bridge, never URLs or tokens.
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

/**
 * Version of THIS app build, reported to the server so the owner can retire
 * an old build ("min supported version") without shipping a new server
 * first.
 *
 * Bump it with every release. It must stay a plain semver string
 * ("1.2.0"); the server compares it numerically.
 *
 * NOTE: it is deliberately a constant instead of a runtime constant
 * (expo-constants / nativeApplicationVersion) so no new dependency and no
 * lockfile change is needed for it.
 */
export const APP_VERSION = "1.0.0";
