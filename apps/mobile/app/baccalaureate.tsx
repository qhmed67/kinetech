/* Web Baccalaureate port (apps/web/src/pages/Baccalaureate.tsx): deep hero
 * with the teal eyebrow pill + #25D366 WhatsApp CTA, source section (PDF
 * links), terms/chapter cards, old-vs-new compare rows, mapping rows with
 * "course example" chips, FAQ accordion (default first open), dark CTA. */

import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import { useLang } from "../src/lang";
import { ktDarkGradient, palette } from "../src/theme";
import { Footer } from "../src/components/web/Footer";
import { TopBar } from "../src/components/web/TopBar";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";
const PDF1 =
  "https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Programming-ArtificialIntelligence-Ar-EB-part1.pdf";
const PDF2 =
  "https://egyptianbaccalaureate.blob.core.windows.net/egyptianbaccalaureate/Programming-ArtificialIntelligence-Ar-EB-part2.pdf";

/** Web .btn with the WhatsApp-green treatment (hover glow). */
function WaGreen({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(WA).catch(() => {})}
      style={[styles.waGreen, wide && { alignSelf: "flex-start" }]}
      accessibilityRole="link"
    >
      <Txt style={styles.waGreenText}>{label}</Txt>
    </Pressable>
  );
}

function BrandLines() {
  // Decorative stand-in for the web's animated brand background lines.
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      style={StyleSheet.absoluteFill}
    >
      <Path d="M-40 420 C 160 300, 320 480, 520 340 S 780 220, 880 300" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
      <Path d="M-40 300 C 180 200, 360 380, 560 240 S 800 120, 900 200" stroke="rgba(110,78,156,0.35)" strokeWidth="1.5" />
      <Path d="M-40 180 C 200 90, 380 280, 580 150 S 820 40, 920 110" stroke="rgba(59,188,217,0.28)" strokeWidth="1.5" />
      <Path d="M-40 60 C 220 -20, 400 170, 600 60 S 840 -40, 940 30" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />
    </Svg>
  );
}

export default function BaccalaureatePage() {
  const { t } = useLang();
  const b = t.bac;
  const [open, setOpen] = useState<number | null>(0);

  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 0 }}>
        {/* hero */}
        <View style={styles.hero}>
          <BrandLines />
          <View style={styles.heroInner}>
            <View style={styles.pill}>
              <Txt style={styles.pillText}>{b.eyebrow}</Txt>
            </View>
            <Txt variant="h1" style={styles.heroT}>
              {b.heroT}
            </Txt>
            <Txt variant="lead" style={styles.heroD}>
              {b.heroD}
            </Txt>
            <WaGreen label={b.bookNow} wide />
          </View>
        </View>

        {/* intro + source */}
        <View style={styles.section}>
          <Txt variant="h2">{b.h2}</Txt>
          <View style={[styles.pill, styles.pillSoft, { marginTop: 16 }]}>
            <Txt style={styles.pillSoftText}>{b.srcT}</Txt>
          </View>
          <Txt variant="lead" style={styles.srcD}>
            {b.srcD}
          </Txt>
          <View style={styles.pdfRow}>
            <Button
              title={b.srcP1}
              variant="secondary"
              onPress={() => void Linking.openURL(PDF1).catch(() => {})}
            />
            <Button
              title={b.srcP2}
              variant="secondary"
              onPress={() => void Linking.openURL(PDF2).catch(() => {})}
            />
          </View>

          <Txt variant="h2" style={{ fontSize: 26, marginTop: 48 }}>
            {b.unitsT}
          </Txt>
          <View style={{ marginTop: 24, gap: 24 }}>
            {b.terms.map((term) => (
              <View key={term.t} style={styles.termCard}>
                <View style={styles.termHead}>
                  <Txt style={styles.termHeadText}>{term.t}</Txt>
                </View>
                <View style={styles.termGrid}>
                  {term.chapters.map((ch, ci) => (
                    <View
                      key={ch.n}
                      style={[
                        styles.chapter,
                        ci === term.chapters.length - 1 && term.chapters.length % 2 === 1 && styles.chapterSpan,
                      ]}
                    >
                      <Txt variant="h4">{ch.n}</Txt>
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {ch.lessons.map((l) => (
                          <Txt key={l} variant="small" tone="muted">
                            — {l}
                          </Txt>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* old vs new */}
        <View style={styles.compareSection}>
          <Txt variant="h2">{b.compareT}</Txt>
          <View style={{ marginTop: 32, gap: 16 }}>
            <View style={styles.compareHead}>
              <Txt style={styles.compareHeadText}>{b.oldT}</Txt>
              <Txt style={styles.compareHeadText}>{b.newT}</Txt>
            </View>
            {b.compare.map((row) => (
              <View key={row.neu} style={styles.compareRow}>
                <View style={styles.compareOld}>
                  <Txt variant="body" style={{ fontWeight: "700" }}>
                    {row.old}
                  </Txt>
                </View>
                <View style={styles.compareNew}>
                  <Txt variant="body" style={{ fontWeight: "700", color: palette.white }}>
                    {row.neu}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* mapping + FAQ */}
        <View style={styles.section}>
          <Txt variant="h2">{b.mapT}</Txt>
          <View style={{ marginTop: 24, gap: 12 }}>
            {b.rows.map((r) => (
              <View key={r.need} style={styles.mapRow}>
                <Txt variant="body" style={{ fontWeight: "700", flexShrink: 1, flex: 1 }}>
                  {r.need}
                </Txt>
                <View style={styles.courseChip}>
                  <Txt style={styles.courseChipText}>{b.courseEx}</Txt>
                </View>
              </View>
            ))}
          </View>

          <Txt variant="h2" style={{ marginTop: 56 }}>
            {b.faqT}
          </Txt>
          <View style={{ marginTop: 24, gap: 12 }}>
            {b.faq.map((f, i) => {
              const isOpen = open === i;
              return (
                <View key={f.q} style={styles.faqCard}>
                  <Pressable
                    onPress={() => setOpen(isOpen ? null : i)}
                    style={styles.faqHead}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <Txt variant="body" style={{ fontWeight: "700", flexShrink: 1, flex: 1 }}>
                      {f.q}
                    </Txt>
                    <View style={[styles.faqToggle, isOpen && { backgroundColor: palette.accent }]}>
                      <Txt style={[styles.faqToggleText, isOpen && { color: "#fff" }]}>
                        {isOpen ? "−" : "+"}
                      </Txt>
                    </View>
                  </Pressable>
                  {isOpen && (
                    <Txt variant="body" tone="muted" style={styles.faqBody}>
                      {f.a}
                    </Txt>
                  )}
                </View>
              );
            })}
          </View>

          {/* dark CTA */}
          <LinearGradient
            colors={ktDarkGradient as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaDark}
          >
            <Txt variant="h2" style={{ color: palette.white, textAlign: "center" }}>
              {b.cta}
            </Txt>
            <View style={styles.ctaRow}>
              <WaGreen label={b.bookNow} />
              <Button
                title={t.catalog.h2}
                variant="outline-light"
                onPress={() => router.push("/courses" as never)}
              />
            </View>
            <Txt variant="meta" style={styles.ctaNote}>
              {b.note}
            </Txt>
          </LinearGradient>
        </View>

        <Footer />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  hero: {
    backgroundColor: palette.deep,
    overflow: "hidden",
  },
  heroInner: {
    paddingVertical: 64,
    paddingHorizontal: 16,
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.teal,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pillText: {
    color: palette.deep,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: "Valley Sans 700",
  },
  pillSoft: {
    backgroundColor: "rgba(59,188,217,0.16)",
  },
  pillSoftText: {
    color: palette.deep,
    fontSize: 12,
    fontWeight: "700",
  },
  heroT: {
    color: palette.white,
    marginTop: 32,
    lineHeight: 46,
  },
  heroD: {
    color: "rgba(255,255,255,0.8)",
    maxWidth: 560,
    marginTop: 24,
  },
  waGreen: {
    alignSelf: "flex-start",
    marginTop: 40,
    borderRadius: 999,
    backgroundColor: "#25D366",
    paddingVertical: 11,
    paddingHorizontal: 22,
    minHeight: 44,
    justifyContent: "center",
    shadowColor: "#25D366",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  waGreenText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Valley Sans 700",
  },
  section: {
    paddingVertical: 72,
    paddingHorizontal: 16,
  },
  srcD: {
    marginTop: 12,
    maxWidth: 560,
  },
  pdfRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  termCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden",
  },
  termHead: {
    backgroundColor: palette.deep,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  termHeadText: {
    color: palette.white,
    fontWeight: "700",
    fontSize: 16,
    fontFamily: "Valley Sans 700",
  },
  termGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: palette.line,
    gap: 1,
    paddingTop: 1,
  },
  chapter: {
    flexGrow: 1,
    flexBasis: "49%",
    backgroundColor: palette.white,
    padding: 20,
  },
  chapterSpan: { flexBasis: "100%" },
  compareSection: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingVertical: 72,
    paddingHorizontal: 16,
  },
  compareHead: {
    flexDirection: "row",
    gap: 16,
  },
  compareHeadText: {
    flex: 1,
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  compareRow: {
    flexDirection: "row",
    gap: 16,
  },
  compareOld: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 20,
    opacity: 0.75,
  },
  compareNew: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: palette.deep,
    padding: 20,
  },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  courseChip: {
    borderRadius: 999,
    backgroundColor: palette.teal,
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexShrink: 0,
  },
  courseChipText: {
    color: palette.deep,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Valley Sans 700",
  },
  faqCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden",
  },
  faqHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  faqToggle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  faqToggleText: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.fg,
  },
  faqBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    lineHeight: 24,
  },
  ctaDark: {
    marginTop: 48,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  ctaRow: {
    marginTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  ctaNote: {
    marginTop: 16,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
});
