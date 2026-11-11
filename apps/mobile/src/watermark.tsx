/* Native watermark overlay (2027-architecture.md §2.4).
 *
 * The student's identity floats over the playback and drifts every 15
 * seconds — the same deterrent the web player uses, but drawn by the NATIVE
 * layer, so it cannot be removed by anything the page does (and it survives
 * a page that plays inside a third-party frame, e.g. Drive's preview).
 *
 * Only the identity travels here — never a media URL.
 */

import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const SPOTS = [
  { top: 12, left: 12 },
  { top: 12, right: 12 },
  { bottom: 64, left: 12 },
  { bottom: 64, right: 12 },
] as const;

export function WatermarkOverlay({ identity }: { identity: string }) {
  const [spot, setSpot] = useState(0);
  const visible = useRef(true);

  useEffect(() => {
    const id = setInterval(() => {
      visible.current = true;
      setSpot(
        (s) => (s + 1 + Math.floor(Math.random() * (SPOTS.length - 1))) % SPOTS.length,
      );
    }, 15000);
    return () => clearInterval(id);
  }, []);

  if (identity === "") return null;

  return (
    <View style={[styles.watermark, SPOTS[spot]]} pointerEvents="none">
      <Text style={styles.text} numberOfLines={1}>
        {identity}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  watermark: {
    position: "absolute",
    maxWidth: "70%",
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
});
