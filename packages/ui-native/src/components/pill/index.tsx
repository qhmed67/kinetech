import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "react-native";
import { color } from "@kinetech/tokens";

export type PillTone = "accent" | "soft" | "teal";

export interface PillProps {
  label: string;
  tone?: PillTone;
  style?: StyleProp<ViewStyle>;
}

/** Small rounded status/label chip. Colors come from @kinetech/tokens only. */
export function Pill({ label, tone = "soft", style }: PillProps) {
  const bg =
    tone === "accent" ? color.accent : tone === "teal" ? color.ktTeal : color.surface;
  const fg = tone === "soft" ? color.muted : color.ktWhite;

  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
