/* Web Legal port (apps/web/src/pages/Legal.tsx): one Shell for privacy and
 * terms — h1, pending pill, paragraphs, home/contact links. */

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useLang } from "../src/lang";
import { palette } from "../src/theme";
import { Footer } from "../src/components/web/Footer";
import { TopBar } from "../src/components/web/TopBar";
import { Txt } from "../src/components/Txt";

export default function LegalPage() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  const { t } = useLang();
  const isTerms = String(page) === "terms";
  const title = isTerms ? t.legal.termsT : t.legal.privacyT;
  const paragraphs = isTerms ? t.legal.tP : t.legal.pP;

  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 0 }}>
        <View style={styles.wrap}>
          <Txt variant="h2">{title}</Txt>
          <View style={styles.pendingPill}>
            <Txt style={styles.pendingText}>{t.legal.pending}</Txt>
          </View>
          <View style={{ marginTop: 20, gap: 20 }}>
            {paragraphs.map((p) => (
              <Txt key={p.slice(0, 24)} variant="lead">
                {p}
              </Txt>
            ))}
          </View>
          <View style={{ marginTop: 32, flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Pressable onPress={() => router.push("/" as never)}>
              <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
                {t.misc.home}
              </Txt>
            </Pressable>
            <Txt variant="small" tone="muted">
              ·
            </Txt>
            <Pressable onPress={() => router.push("/contact" as never)}>
              <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
                {t.contactPage.h2}
              </Txt>
            </Pressable>
          </View>
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
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  pendingPill: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(59,188,217,0.16)",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pendingText: {
    color: palette.deep,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Valley Sans 700",
  },
});
