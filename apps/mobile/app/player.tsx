/* Native player (2027-architecture.md §2.4).
 *
 * The player is the ONLY place a protected lesson is rendered. It receives a
 * short-lived grant from the server (short-lived media URL + watermark
 * identity) — the URL never enters the WebView and never reaches the student.
 *
 * Watermark: the student's identity floats over the video and drifts every
 * 15 seconds, exactly like the web player. It is the main deterrent against
 * camera recording and leaks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { refreshPlayback, requestPlayback } from "../src/playback";
import { getDeviceId, getSessionToken } from "../src/session";
import { sendToWeb } from "../src/shellRef";

type Phase = "loading" | "playing" | "denied" | "error";

const WATERMARK_SPOTS = [
  { top: 12, left: 12 },
  { top: 12, right: 12 },
  { bottom: 64, left: 12 },
  { bottom: 64, right: 12 },
] as const;

export default function Player() {
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [watermark, setWatermark] = useState("");
  const [spot, setSpot] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  // 1. Ask the server for the grant (server holds the gate).
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = lessonId ?? "";
      if (id === "") {
        if (alive) {
          setPhase("error");
          setMessage("Lesson not found.");
        }
        return;
      }
      const token = await getSessionToken();
      const deviceId = await getDeviceId();
      if (!token) {
        if (alive) {
          setPhase("denied");
          setMessage("Sign in from the app to watch this lesson.");
        }
        return;
      }
      const result = await requestPlayback(id, token, deviceId);
      if (!alive) return;
      if (!result) {
        setPhase("error");
        setMessage("Could not reach the server — check your connection and retry.");
        return;
      }
      if (!result.ok) {
        setPhase("denied");
        setMessage(result.ar !== "" ? result.ar : result.en);
        return;
      }
      setWatermark(
        result.grant.email +
          (result.grant.phoneLast4 ? ` · ${result.grant.phoneLast4}` : ""),
      );
      setUrl(result.grant.url);
      setPhase("playing");
    })();
    return () => {
      alive = false;
    };
  }, [lessonId]);

  // 2. Watermark drift (every 15s), like the web player.
  useEffect(() => {
    const id = setInterval(
      () =>
        setSpot(
          (s) => (s + 1 + Math.floor(Math.random() * (WATERMARK_SPOTS.length - 1))) % WATERMARK_SPOTS.length,
        ),
      15000,
    );
    return () => clearInterval(id);
  }, []);

  const player = useVideoPlayer(url, (p) => {
    if (url) p.play();
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const refreshed = useRef(false);

  // Token expiry: the grant is short-lived. When the player errors we renew
  // the token WITHOUT burning another view (the server re-checks the
  // entitlement) and continue where we stopped.
  useEffect(() => {
    if (status !== "error") return;
    if (refreshed.current) {
      setPhase("error");
      setMessage("The lesson could not be loaded. Open it again to continue.");
      return;
    }
    refreshed.current = true;
    void (async () => {
      const id = lessonId ?? "";
      const token = await getSessionToken();
      const deviceId = await getDeviceId();
      if (!token) {
        setPhase("denied");
        setMessage("Sign in from the app to watch this lesson.");
        return;
      }
      const result = await refreshPlayback(id, token, deviceId);
      if (!result || !result.ok) {
        setPhase(result && !result.ok ? "denied" : "error");
        setMessage(
          result && !result.ok
            ? result.ar !== ""
              ? result.ar
              : result.en
            : "Could not reach the server — check your connection and retry.",
        );
        return;
      }
      try {
        await player.replaceAsync(result.grant.url);
        player.play();
      } catch {
        setPhase("error");
        setMessage("The lesson could not be loaded. Open it again to continue.");
      }
    })();
  }, [status, lessonId, player]);

  const close = useCallback(() => {
    const progressSec = Math.round((Date.now() - startedAt.current) / 1000);
    // Tell the page the player closed and how far it got (no media URL).
    sendToWeb({
      v: 1,
      type: "playerClosed",
      lessonId: lessonId ?? "",
      progressSec,
    });
    router.replace("/" as never);
  }, [lessonId]);

  if (phase !== "playing" || !url) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top + 24 }]}>
        {phase === "loading" ? (
          <>
            <ActivityIndicator color="#3BBCD9" />
            <Text style={styles.note}>Preparing the lesson…</Text>
          </>
        ) : (
          <>
            <Text style={styles.deniedTitle}>Playback not available</Text>
            <Text style={styles.note}>{message}</Text>
          </>
        )}
        <Pressable onPress={close} style={styles.closeBtn} accessibilityRole="button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture={false}
      />

      {/* Floating identity watermark — drifts, never shows a URL. */}
      {watermark !== "" ? (
        <View style={[styles.watermark, WATERMARK_SPOTS[spot]]} pointerEvents="none">
          <Text style={styles.watermarkText} numberOfLines={1}>
            {watermark}
          </Text>
        </View>
      ) : null}

      <Pressable onPress={close} style={styles.closeBtn} accessibilityRole="button">
        <Text style={styles.closeText}>{isPlaying ? "Pause & close" : "Close"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000000" },
  watermark: {
    position: "absolute",
    maxWidth: "70%",
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  watermarkText: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
  deniedTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  note: { color: "rgba(255,255,255,0.72)", fontSize: 14, marginTop: 12, textAlign: "center" },
  closeBtn: {
    position: "absolute",
    right: 16,
    bottom: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeText: { color: "#1A1A1A", fontSize: 14, fontWeight: "700" },
});
