/* Hybrid shell — the only screen the app owns (2027-architecture.md §2.2).
 *
 * The UI is the existing web app loaded in a WebView. This screen:
 *   - refuses to show the app until the server is reachable (no offline use),
 *   - loads the production web app over HTTPS,
 *   - whitelists the web origin (anything else opens in the system browser),
 *   - validates every message that arrives from the page (origin + schema),
 *   - handles the Android back button (page history first, then exit),
 *   - keeps pull-to-refresh, safe areas and the keyboard working,
 *   - disables WebView debugging outside development builds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lockAsync, OrientationLock } from "expo-screen-orientation";
import { ALLOWED_ORIGINS, WEB_URL } from "../src/config";
import { handleWebMessage, onWebMessage, RECEIVER_SCRIPT } from "../src/bridge";
import {
  getEnvironmentRisk,
  isScreenCaptured,
  onCaptureChange,
  riskReasons,
} from "../src/environment";
import { sendToWeb, setShellWebView } from "../src/shellRef";
import { WatermarkOverlay } from "../src/watermark";

/** Mobile User-Agent with the shell marker appended (a hint for the API). */
const USER_AGENT =
  Platform.OS === "ios"
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 KineTechApp/1.0"
    : "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 KineTechApp/1.0";

/** react-native-webview 14 types the component with the platform-agnostic
 *  stub, so the imperative handle is resolved from the component type. */
type WebViewHandle = React.ComponentRef<typeof WebView>;

/** URL the WebView loads: the production app plus a per-launch cache buster.
 *  Deploys ship new hashed assets, but the WebView can keep serving the
 *  document it fetched last time, which makes a fixed UI look unfixed on a
 *  phone until the app data is cleared. A unique query per launch forces the
 *  HTML to be refetched while the hashed JS/CSS stay cached. */
const LAUNCH_URL = `${WEB_URL}${WEB_URL.includes("?") ? "&" : "?"}v=${Date.now()}`;

/** Puts the shell's safe-area insets on `window.__KT_SAFE_AREA` so the page
 *  (which has no RN-safe-area source of its own and where the WebView does
 *  not set env() vars) can offset its expanded-player buttons. */
const safeAreaScript = (insets: { top: number; right: number; bottom: number; left: number }): string =>
  `window.__KT_SAFE_AREA = ${JSON.stringify(insets)};`;

export default function Shell() {
  const webRef = useRef<WebViewHandle | null>(null);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [identity, setIdentity] = useState("");
  const [captured, setCaptured] = useState(false);
  // The page announces the expanded Drive overlay so the hardware back button
  // can collapse it first (bridge message `playerExpanded`).
  const [playerExpanded, setPlayerExpanded] = useState(false);
  // Online gate: the shell refuses to show the web app until the server is
  // reachable. `null` = checking, `true` = allowed, `false` = blocked.
  const [online, setOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    setChecking(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      // Any HTTP answer means the network and the server are reachable.
      await fetch(WEB_URL, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      clearTimeout(timer);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  // Returning to the app re-checks only while blocked; a working session is
  // never torn down by this effect.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && online === false) void checkConnection();
    });
    return () => sub.remove();
  }, [online, checkConnection]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    const url = event.nativeEvent.url ?? WEB_URL;
    handleWebMessage(data, url);
    // The page announces the expanded-overlay state with a bare envelope
    // ({ type: "player-fullscreen", expanded }) — see ProtectedVideoPlayer.
    // Dispatch it here directly: the v:1-envelope bridge path drops it.
    try {
      const message = JSON.parse(String(data)) as { type?: unknown; expanded?: unknown };
      if (message && message.type === "player-fullscreen" && typeof message.expanded === "boolean") {
        setPlayerExpanded(message.expanded);
      }
    } catch {
      /* not a JSON player message — ignore */
    }
  }, []);

  // Android back button: collapse the expanded overlay, then walk the web
  // history, then leave the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (playerExpanded) {
        sendToWeb({ v: 1, type: "closeExpand" });
        return true;
      }
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, playerExpanded]);

  // Bridge: the web asks native to play a lesson. The player screen requests
  // the grant from the server itself — the page never sees a media URL.
  useEffect(
    () =>
      onWebMessage((message) => {
        if (message.type === "playVideo") {
          router.push(`/player?lessonId=${encodeURIComponent(message.lessonId)}` as never);
        }
        if (message.type === "watermark") {
          // The identity the native layer floats over the playback.
          setIdentity(
            message.email + (message.phoneLast4 ? ` · ${message.phoneLast4}` : ""),
          );
        }
      }),
    [],
  );

  // Orientation: the shell starts portrait; while a player is expanded it
  // locks landscape; a collapse returns to portrait. Locks are serialized by
  // a sequence counter — a late-resolving "lock landscape" can never
  // override a newer "lock portrait".
  const lockSeqRef = useRef(0);
  const lockOrientation = useCallback((lock: OrientationLock) => {
    const seq = ++lockSeqRef.current;
    void (async () => {
      try {
        await lockAsync(lock);
      } catch {
        return; /* unsupported — stay unlocked */
      }
      if (lockSeqRef.current !== seq) return;
      const orientation: "landscape" | "portrait" =
        lock === OrientationLock.LANDSCAPE ? "landscape" : "portrait";
      // Wait (≤ ~1 s) for the WebView to report the target orientation.
      const start = Date.now();
      while (Date.now() - start < 1000) {
        const landscape = window.innerWidth > window.innerHeight;
        if (landscape === (orientation === "landscape")) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (lockSeqRef.current !== seq) return;
      sendToWeb({ v: 1, type: "player-orientation-settled", orientation, seq });
    })();
  }, []);

  // Defensive pass: ~1.2 s after the player opens, if the landscape lock did
  // not actually take effect, re-assert portrait and nudge the WebView with a
  // resize so the page re-measures. (No-op when the lock worked.)
  useEffect(() => {
    if (!playerExpanded) return;
    const t = setTimeout(() => {
      if (!(window.innerWidth > window.innerHeight)) {
        void lockAsync(OrientationLock.PORTRAIT_UP).catch(() => {});
        webRef.current?.injectJavaScript("window.dispatchEvent(new Event('resize'));");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [playerExpanded]);

  useEffect(() => {
    lockOrientation(OrientationLock.PORTRAIT_UP);
  }, [lockOrientation]);

  useEffect(() => {
    if (playerExpanded) {
      lockOrientation(OrientationLock.LANDSCAPE);
      StatusBar.setHidden(true, "fade");
    } else {
      lockOrientation(OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false, "fade");
    }
  }, [playerExpanded, lockOrientation]);

  // Safety nets — never get stuck in landscape:
  // backgrounding, reloading the page, leaving the shell, going down.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") lockOrientation(OrientationLock.PORTRAIT_UP);
    });
    return () => sub.remove();
  }, [lockOrientation]);

  useEffect(() => () => lockOrientation(OrientationLock.PORTRAIT_UP), [lockOrientation]);

  // A new navigation or reload inside the WebView restores portrait.
  const onLoadStart = useCallback(() => {
    lockOrientation(OrientationLock.PORTRAIT_UP);
  }, [lockOrientation]);

  // Let the native screens (the player) talk back to the page.
  useEffect(() => {
    setShellWebView(webRef.current);
    return () => setShellWebView(null);
  }, []);

  // One device check per shell load, reported to the page over the bridge.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const reasons = riskReasons(await getEnvironmentRisk());
      if (!alive) return;
      sendToWeb({
        v: 1,
        type: "deviceStatus",
        ok: reasons.length === 0,
        reason: reasons.length > 0 ? reasons.join(",") : undefined,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // iOS recording / mirroring: cover the WebView so the page cannot render
  // a lesson while the screen is being captured.
  useEffect(() => {
    void isScreenCaptured().then((value) => setCaptured(value));
    return onCaptureChange(setCaptured);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    webRef.current?.reload();
  }, []);

  // Pull-to-refresh: react-native-webview has no refreshControl, so we watch
  // the scroll offset and reload when the page is pulled past the top.
  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (event.nativeEvent.contentOffset.y < -70 && !refreshing) {
        onRefresh();
      }
    },
    [refreshing, onRefresh],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {online ? (
        <>
          <WebView
            ref={webRef}
            source={{ uri: LAUNCH_URL }}
            originWhitelist={ALLOWED_ORIGINS}
            userAgent={USER_AGENT}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            // Drive's own fullscreen button would promote the preview iframe
            // into the Android WebView custom view, where it is invisible to
            // the page and overflows the screen. Without it the page offers
            // its own expanded-player buttons (see ProtectedVideoPlayer).
            allowsFullscreenVideo={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            injectedJavaScriptBeforeContentLoaded={RECEIVER_SCRIPT + safeAreaScript(insets)}
            onLoadStart={onLoadStart}
            onMessage={onMessage}
            onScroll={onScroll}
            scrollEnabled
            onLoadEnd={() => setRefreshing(false)}
            onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
            onShouldStartLoadWithRequest={(request) => {
              // Only the web app may stay inside the shell; every other link
              // opens in the system browser.
              try {
                const { origin } = new URL(request.url);
                if (ALLOWED_ORIGINS.includes(origin)) return true;
              } catch {
                /* malformed URL -> external */
              }
              void Linking.openURL(request.url).catch(() => {});
              return false;
            }}
            webviewDebuggingEnabled={__DEV__}
            setSupportMultipleWindows={false}
            style={styles.web}
          />
          {/* The identity floats over whatever the page plays (including a
              third-party frame) — drawn by the native layer, not the page. */}
          <WatermarkOverlay identity={identity} />
          {refreshing ? (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator size="small" color="#6E4E9C" />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>
            {online === null ? "Connecting…" : "No connection"}
          </Text>
          <Text style={styles.gateNote}>
            {online === null
              ? "Checking the connection…"
              : "KineTech needs an internet connection. Reconnect, then retry."}
          </Text>
          <Pressable
            onPress={() => void checkConnection()}
            disabled={checking}
            style={styles.gateButton}
            accessibilityRole="button"
            accessibilityLabel="Retry connection"
          >
            {checking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.gateButtonText}>Retry</Text>
            )}
          </Pressable>
        </View>
      )}
      {captured ? (
        <View style={styles.captureOverlay}>
          <Text style={styles.captureNote}>Screen recording detected. Playback paused.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  web: { flex: 1, backgroundColor: "#FFFFFF" },
  loader: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  captureOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  captureNote: { color: "#FFFFFF", fontSize: 15, textAlign: "center" },
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  gateTitle: { color: "#1A1A1A", fontSize: 22, fontWeight: "700", marginBottom: 10 },
  gateNote: { color: "#5B5B66", fontSize: 15, lineHeight: 22, textAlign: "center" },
  gateButton: {
    marginTop: 22,
    minWidth: 140,
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#6E4E9C",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  gateButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
