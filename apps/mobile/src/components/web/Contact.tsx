/* Web Contact port (apps/web/src/components/Contact.tsx): the final
 * .cta-dark block with logo, heading, two social buttons, meta numbers. */

import { Linking, Image, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLang } from "../../lang";
import { ktDarkGradient, palette } from "../../theme";
import { Txt } from "../Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";
const FB = "https://www.facebook.com/profile.php?id=61588373937044";
const LOGO = require("../../../assets/logo.png");

export function Contact() {
  const { t } = useLang();
  const c = t.contact;
  return (
    <View style={styles.section}>
      <LinearGradient
        colors={ktDarkGradient as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ctaDark}
      >
        <Image source={LOGO} style={styles.logoCta} />
        <Txt variant="h2" style={{ color: palette.white, marginTop: 16, textAlign: "center" }}>
          {c.h2}
        </Txt>
        <Txt variant="body" style={{ color: "rgba(255,255,255,0.82)", marginTop: 10, textAlign: "center" }}>
          {c.p}
        </Txt>
        <View style={styles.btnRow}>
          <Button
            title={c.wa}
            variant="light"
            onPress={() => void Linking.openURL(WA).catch(() => {})}
          />
          <Button
            title={c.fb}
            variant="outline-light"
            onPress={() => void Linking.openURL(FB).catch(() => {})}
          />
        </View>
        <Txt variant="meta" style={styles.metaNum}>
          {c.metaNum} · {c.metaFb}
        </Txt>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    // Web .section padding-block: clamp(48px, 7vw, ...) -> 48px on phones.
    paddingVertical: 48,
    // Web .kt-wrap gutter (index.css --gutter: 32px).
    paddingHorizontal: 32,
    backgroundColor: palette.white,
  },
  ctaDark: {
    borderRadius: 32,
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  logoCta: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.white,
    padding: 5,
  },
  btnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 28,
  },
  metaNum: {
    marginTop: 18,
    color: "rgba(255,255,255,0.72)",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
});
