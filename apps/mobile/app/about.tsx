/* Web About port (apps/web/src/pages/About.tsx): eyebrow + h1, pillars
 * copy blocks, footer tag, dark aboutBac card with CTA. */

import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useLang } from "../src/lang";
import { ktDarkGradient, palette } from "../src/theme";
import { Footer } from "../src/components/web/Footer";
import { TopBar } from "../src/components/web/TopBar";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

export default function AboutPage() {
  const { t } = useLang();
  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 0 }}>
        <View style={styles.wrap}>
          <Txt style={styles.eyebrow}>{t.misc.aboutEyebrow}</Txt>
          <Txt variant="h2">{t.misc.aboutH}</Txt>

          <Txt variant="h2" style={{ fontSize: 24, marginTop: 32 }}>
            {t.pillars.bigH}
          </Txt>
          <Txt variant="lead" style={styles.lead}>
            {t.pillars.bigP}
          </Txt>

          <Txt variant="h2" style={{ fontSize: 24, marginTop: 32 }}>
            {t.pillars.mindH}
          </Txt>
          <Txt variant="lead" style={styles.lead}>
            {t.pillars.mindP}
          </Txt>

          <Txt variant="body" style={styles.tag}>
            {t.footer.tag}
          </Txt>

          <LinearGradient
            colors={ktDarkGradient as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bacCard}
          >
            <Txt variant="h2" style={{ fontSize: 24, color: palette.white }}>
              {t.aboutBac.t}
            </Txt>
            <Txt variant="body" style={styles.bacD}>
              {t.aboutBac.d}
            </Txt>
            <Button
              title={t.aboutBac.cta}
              variant="light"
              onPress={() => router.push("/baccalaureate" as never)}
              style={{ marginTop: 20, alignSelf: "flex-start" }}
            />
          </LinearGradient>
        </View>

        <Footer />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  wrap: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    maxWidth: 820,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 14,
    fontFamily: "Valley Sans 700",
  },
  lead: {
    marginTop: 12,
  },
  tag: {
    marginTop: 32,
    color: palette.accent,
    fontWeight: "700",
  },
  bacCard: {
    marginTop: 32,
    borderRadius: 24,
    padding: 28,
    overflow: "hidden",
  },
  bacD: {
    marginTop: 8,
    color: "rgba(255,255,255,0.8)",
    maxWidth: 480,
  },
});
