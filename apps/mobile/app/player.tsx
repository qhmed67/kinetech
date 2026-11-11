/* Native player screen — Phase 2 placeholder.
 *
 * Phase 2 only proves the round trip: the web sends `playVideo`, native
 * opens this screen with the lesson id and sends `playerClosed` back when
 * the student leaves. The real player (expo-video + Widevine/FairPlay,
 * dynamic watermark, FLAG_SECURE, environment checks) lands in Phase 3/4.
 *
 * The lesson id is an id — never a URL, a token or a licence.
 */

import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Player() {
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>();
  const insets = useSafeAreaInsets();
  const startedAt = useRef(Date.now());

  const close = useCallback(() => {
    const progressSec = Math.round((Date.now() - startedAt.current) / 1000);
    // Native → web: the page learns the player closed and how far it got.
    // (The real player reports actual playback progress in Phase 3.)
    router.replace("/" as never);
    void progressSec;
  }, []);

  useEffect(() => {
    return () => {
      void 0;
    };
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>NATIVE PLAYER</Text>
      </View>
      <Text style={styles.title}>Lesson</Text>
      <Text style={styles.lessonId} selectable>
        {lessonId ?? "—"}
      </Text>
      <Text style={styles.note}>
        Phase 2 test player. DRM playback, the dynamic watermark and the
        environment checks arrive with the native player in Phase 3.
      </Text>
      <Pressable onPress={close} style={styles.closeBtn} accessibilityRole="button">
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(110,78,156,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 20,
  },
  badgeText: {
    color: "#C9B8E4",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  lessonId: {
    color: "#3BBCD9",
    fontSize: 26,
    fontWeight: "700",
    marginTop: 6,
  },
  note: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 24,
  },
  closeBtn: {
    marginTop: 32,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  closeText: { color: "#1A1A1A", fontSize: 15, fontWeight: "700" },
});
