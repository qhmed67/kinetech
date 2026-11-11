/* Web .cta-dark port — the dark gradient closing panel used across pages
 * (services CTA, process CTA, bac CTA): heading, lead, WhatsApp button. */

import { Linking, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { ktDarkGradient, palette } from "../../theme";
import { Txt } from "../Txt";
import { Button } from "@kinetech/ui-native";

export function WaIconWhite({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke={palette.white} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CtaDark({
  title,
  text,
  button,
  style,
}: {
  title: string;
  text: string;
  button: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={ktDarkGradient as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.ctaDark, style]}
    >
      <Txt variant="h2" style={{ color: palette.white, textAlign: "center" }}>
        {title}
      </Txt>
      <Txt variant="body" style={{ color: "rgba(255,255,255,0.82)", textAlign: "center", marginTop: 10 }}>
        {text}
      </Txt>
      <Button
        title={button}
        variant="light"
        onPress={() => void Linking.openURL("https://wa.me/201042031062").catch(() => {})}
        style={styles.btn}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ctaDark: {
    borderRadius: 32,
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  btn: { marginTop: 24, alignSelf: "center" },
});
