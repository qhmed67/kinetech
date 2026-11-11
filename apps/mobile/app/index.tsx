/* Hybrid shell — the only screen the app owns (2027-architecture.md §2.2).
 *
 * The UI is the existing web app loaded in a WebView. This screen:
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
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ALLOWED_ORIGINS, WEB_URL } from "../src/config";
import { handleWebMessage, onWebMessage, RECEIVER_SCRIPT } from "../src/bridge";
import { setShellWebView } from "../src/shellRef";
import { WatermarkOverlay } from "../src/watermark";

/** Mobile User-Agent with the shell marker appended (a hint for the API). */
const USER_AGENT =
  Platform.OS === "ios"
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 KineTechApp/1.0"
    : "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 KineTechApp/1.0";

/** react-native-webview 14 types the component with the platform-agnostic
 *  stub, so the imperative handle is resolved from the component type. */
type WebViewHandle = React.ComponentRef<typeof WebView>;

export default function Shell() {
  const webRef = useRef<WebViewHandle | null>(null);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [identity, setIdentity] = useState("");

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    const url = event.nativeEvent.url ?? WEB_URL;
    handleWebMessage(data, url);
  }, []);

  // Android back button: walk the web history first, then leave the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

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

  // Let the native screens (the player) talk back to the page.
  useEffect(() => {
    setShellWebView(webRef.current);
    return () => setShellWebView(null);
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
      <WebView
        ref={webRef}
        source={{ uri: WEB_URL }}
        originWhitelist={ALLOWED_ORIGINS}
        userAgent={USER_AGENT}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        injectedJavaScriptBeforeContentLoaded={RECEIVER_SCRIPT}
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
});
