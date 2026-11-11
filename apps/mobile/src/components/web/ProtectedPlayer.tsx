/* Web ProtectedVideoPlayer port for RN (apps/web/src/components/
 * ProtectedVideoPlayer.tsx). The raw Drive/YouTube URL never sits in props
 * or state — only the server-issued embed URL from POST /api/play (the same
 * endpoint the web uses; PRODUCT-RULES). Drive preview offers no play
 * events, so completion uses the same wall-clock accumulator (>=80% of the
 * server minutes) the web uses for API-less frames. Watermark identity
 * overlays drift positions every 15s like the web. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { ENV } from "../../lib/env";
import { getSupabase } from "../../lib/supabase";
import { palette } from "../../theme";
import { Txt } from "../Txt";

export type PlayDenied = { status: number; code: string; ar: string; en: string };

type Grant = {
  embedUrl: string;
  minutes: number;
  email: string;
  phoneLast4: string;
};

const WM_SPOTS = [
  { top: "10%", left: 12 },
  { top: "10%", right: 12 },
  { bottom: 64, left: 12 },
  { bottom: 64, right: 12 },
] as const;

export function ProtectedPlayer({
  videoId,
  onProgress,
  onSeeked,
  onDuration,
  onEnded,
  onDenied,
  onSessionDead,
}: {
  videoId: string;
  onProgress: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
  onDenied: (e: PlayDenied) => void;
  onSessionDead: () => void;
}) {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [spot, setSpot] = useState(() => Math.floor(Math.random() * WM_SPOTS.length));
  const endedRef = useRef(false);
  const elapsedRef = useRef(0);

  // Grant fetch: exactly one /api/play per mount (same rules as web — the
  // server's 30-minute repeat window makes any residual duplicate free).
  useEffect(() => {
    let alive = true;
    setGrant(null);
    setFailed(false);
    setStarted(false);
    endedRef.current = false;
    elapsedRef.current = 0;
    void (async () => {
      try {
        const sb = getSupabase();
        const session = sb ? await sb.auth.getSession() : null;
        const token = session?.data?.session?.access_token ?? null;
        if (!alive) return;
        if (!token) {
          onSessionDead();
          return;
        }
        const r = await fetch(`${ENV.API_BASE_URL}/api/play`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ video_id: videoId }),
        }).catch(() => null);
        if (!alive) return;
        if (!r) {
          setFailed(true);
          return;
        }
        const body = (await r.json().catch(() => null)) as {
          ok?: boolean; code?: string; ar?: string; en?: string;
          embedUrl?: string; minutes?: number;
          watermark?: { email?: string; phoneLast4?: string };
        } | null;
        if (!alive) return;
        if (!r.ok || !body || body.ok !== true || typeof body.embedUrl !== "string") {
          const code = typeof body?.code === "string" ? body.code : "";
          if (r.status === 401 || code === "SESSION_MISMATCH" || code === "INVALID_TOKEN") {
            onSessionDead();
          } else {
            onDenied({
              status: r.status,
              code,
              ar: typeof body?.ar === "string" ? body.ar : "",
              en: typeof body?.en === "string" ? body.en : "",
            });
          }
          return;
        }
        onDuration(typeof body.minutes === "number" ? body.minutes * 60 : 0);
        setGrant({
          embedUrl: body.embedUrl,
          minutes: typeof body.minutes === "number" ? body.minutes : 0,
          email: body.watermark?.email ?? "",
          phoneLast4: body.watermark?.phoneLast4 ?? "",
        });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Watermark drift (web: every 15s, random spot).
  useEffect(() => {
    const id = setInterval(
      () => setSpot((s) => (s + 1 + Math.floor(Math.random() * (WM_SPOTS.length - 1))) % WM_SPOTS.length),
      15000,
    );
    return () => clearInterval(id);
  }, []);

  // Wall-clock completion for API-less frames (Drive preview offers no play
  // state; the server already counted the view at grant time).
  useEffect(() => {
    if (!grant || !started) return;
    const need = Math.max(60, Math.round((grant.minutes || 10) * 60 * 0.8));
    const id = setInterval(() => {
      elapsedRef.current += 1;
      const n = elapsedRef.current;
      onProgress(n);
      if (n >= need && !endedRef.current) {
        endedRef.current = true;
        onEnded();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [grant, started, onProgress, onEnded]);

  const openExternal = useCallback(() => {
    if (grant) void Linking.openURL(grant.embedUrl).catch(() => {});
  }, [grant]);

  const wm = grant ? `${grant.email}${grant.phoneLast4 ? " · " + grant.phoneLast4 : ""}` : "";

  if (failed) {
    return (
      <View style={[styles.frame, styles.center]}>
        <Txt variant="h4">Failed to load player</Txt>
        <Txt variant="small" tone="muted" style={{ marginTop: 6 }}>
          Check your connection and try again.
        </Txt>
      </View>
    );
  }
  if (!grant) {
    return <View style={[styles.frame, styles.center, styles.loading]} />;
  }

  const w = WM_SPOTS[spot] as { top?: string; bottom?: number; left?: number; right?: string | number };

  return (
    <View style={styles.frame}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setStarted(true)} accessibilityLabel="Start playback" />
      <WebView
        source={{ uri: grant.embedUrl }}
        style={styles.webview}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        onShouldStartLoadWithRequest={(req) => {
          // Keep navigation inside the embed host; open anything else outside.
          try {
            const host = new URL(grant.embedUrl).host;
            return new URL(req.url).host === host;
          } catch {
            return false;
          }
        }}
      />
      {/* watermark overlay (identity + drift, like the web) */}
      <View style={[styles.wm, w as object]} pointerEvents="none">
        <Txt style={styles.wmText} numberOfLines={1}>
          {wm}
        </Txt>
      </View>
      {!started && (
        <Pressable style={styles.poster} onPress={() => setStarted(true)}>
          <Txt style={{ color: palette.white, fontWeight: "700" }}>▶</Txt>
        </Pressable>
      )}
      {/* external fallback (Drive app deep-link) */}
      <Pressable onPress={openExternal} style={styles.openBtn} accessibilityLabel="Open externally">
        <Txt style={styles.openBtnText}>↗</Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: palette.black,
  },
  center: { alignItems: "center", justifyContent: "center" },
  loading: { backgroundColor: palette.surface },
  webview: { ...StyleSheet.absoluteFill, backgroundColor: palette.black },
  poster: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  wm: {
    position: "absolute",
    maxWidth: "70%",
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wmText: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
  openBtn: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  openBtnText: { color: palette.white, fontSize: 14 },
});
