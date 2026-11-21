/* Blocked screen (2027-architecture.md §2.2).
 *
 * Shown when the device fails an environment check. It never renders media,
 * a URL or a token — only a plain explanation and a way back to the shell.
 * These checks raise the cost of copying; they are not DRM.
 */

import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Blocked() {
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const reasons = (reason ?? "").split(",").filter(Boolean);
  const detail =
    reasons.length > 0
      ? `Unsafe environment detected: ${reasons.join(", ")}.`
      : "This device does not meet the playback requirements.";

  const close = useCallback(() => router.replace("/" as never), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>Playback blocked</Text>
      <Text style={styles.note}>{detail}</Text>
      <Text style={styles.note}>
        Close other apps, disconnect USB debugging or external displays, then try again.
      </Text>
      <Pressable onPress={close} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Back to lessons</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 24 },
  title: { color: "#1A1A1A", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  note: { color: "#5B5B66", fontSize: 15, lineHeight: 22, marginBottom: 10 },
  button: {
    marginTop: 20,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#6E4E9C",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
