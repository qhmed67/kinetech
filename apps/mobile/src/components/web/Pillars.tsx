/* Web Pillars port (apps/web/src/components/Pillars.tsx): the "flow" bento —
 * 4 numbered art cards (exact bg/fg colors) + deep 5th CTA card with the
 * WhatsApp pill. Same SVG arts (ChatArt/ScopeArt/ShipArt/CapArt/SendArt). */

import { Linking, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { useLang } from "../../lang";
import { ktFont, palette } from "../../theme";
import { Txt } from "../Txt";

const WA = "https://wa.me/201042031062";

function Art({ kind, size, color }: { kind: number; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {kind === 0 && (
        <>
          <Rect x="10" y="18" width="100" height="64" rx="16" fill={color} opacity={0.16} />
          <Rect x="24" y="34" width="52" height="8" rx="4" fill={color} />
          <Rect x="24" y="48" width="72" height="7" rx="3.5" fill={color} opacity={0.55} />
          <Rect x="24" y="60" width="60" height="7" rx="3.5" fill={color} opacity={0.55} />
          <Path d="M34 82l-6 16 20-16z" fill={color} opacity={0.16} />
          <Circle cx="94" cy="34" r="10" fill={color} opacity={0.35} />
        </>
      )}
      {kind === 1 && (
        <>
          <Circle cx="60" cy="60" r="44" stroke={color} strokeWidth="9" opacity={0.2} />
          <Circle cx="60" cy="60" r="26" stroke={color} strokeWidth="9" opacity={0.45} />
          <Circle cx="60" cy="60" r="9" fill={color} />
          <Path d="M92 30l14-14M106 30l-14-14" stroke={color} strokeWidth="7" strokeLinecap="round" opacity={0.7} />
        </>
      )}
      {kind === 2 && (
        <>
          <Rect x="18" y="66" width="84" height="30" rx="15" fill={color} opacity={0.16} />
          <Path d="M60 92V30M60 30L36 54M60 30l24 24" stroke={color} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx="88" cy="30" r="9" fill={color} opacity={0.5} />
        </>
      )}
      {kind === 3 && (
        <>
          <Path d="M60 26L12 46l48 20 38-16v24h10V46L60 26z" fill={color} opacity={0.75} />
          <Path d="M32 60v16c0 8 12 16 28 16s28-8 28-16V60l-28 12-28-12z" fill={color} opacity={0.3} />
          <Circle cx="60" cy="100" r="6" fill={color} />
        </>
      )}
      {kind === 4 && (
        <G transform="translate(30,30) scale(2.5)" opacity={0.9}>
          <Path d="m22 2-7 20-4-9-9-4Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M22 2 11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
    </Svg>
  );
}

export function Pillars() {
  const { t } = useLang();
  const f = t.flow;
  const cards = [
    { n: "1", title: f.steps[0].title, desc: f.steps[0].desc, bg: "#6E4E9C", fg: "#FFFFFF", sub: "rgba(255,255,255,.75)", art: 0 },
    { n: "2", title: f.steps[1].title, desc: f.steps[1].desc, bg: "#D6E9F8", fg: "#1A1A1A", sub: "rgba(26,26,26,.68)", art: 1 },
    { n: "3", title: f.steps[2].title, desc: f.steps[2].desc, bg: "#D3EDC3", fg: "#1A1A1A", sub: "rgba(26,26,26,.68)", art: 2 },
    { n: "4", title: f.steps[3].title, desc: f.steps[3].desc, bg: "#3BBCD9", fg: "#0E2A33", sub: "rgba(14,42,51,.72)", art: 3 },
  ];
  return (
    <View style={styles.section}>
      <Txt style={styles.eyebrow}>{f.eyebrow}</Txt>
      <Txt variant="h2" style={styles.h2}>
        {f.h2}
      </Txt>
      <View style={styles.grid}>
        {cards.map((c) => (
          <View key={c.n} style={[styles.card, { backgroundColor: c.bg }]}>
            <View style={styles.cardTop}>
              <Txt style={[styles.num, { color: c.fg }]}>{c.n}</Txt>
              <Art kind={c.art} size={40} color={c.fg} />
            </View>
            <View style={styles.cardBody}>
              <Txt variant="h3" style={{ color: c.fg }}>
                {c.title}
              </Txt>
              <Txt variant="meta" style={{ color: c.sub, marginTop: 6, lineHeight: 18 }}>
                {c.desc}
              </Txt>
            </View>
          </View>
        ))}
        {/* 5th: deep CTA card */}
        <View style={[styles.card, styles.cardWide, { backgroundColor: palette.deep }]}>
          <View style={styles.cardTop}>
            <Txt style={[styles.num, { color: palette.teal }]}>5</Txt>
            <Art kind={4} size={40} color={palette.white} />
          </View>
          <View style={styles.cardBody}>
            <Txt variant="h3" style={{ color: palette.white }}>
              {f.ctaTitle}
            </Txt>
            <Txt variant="meta" style={{ color: "rgba(255,255,255,0.72)", marginTop: 6, lineHeight: 18 }}>
              {f.ctaText}
            </Txt>
            <Pressable
              onPress={() => void Linking.openURL(WA).catch(() => {})}
              style={styles.ctaBtn}
              accessibilityRole="link"
            >
              <Txt style={{ color: palette.deep, fontWeight: "700", fontSize: 15 }}>{f.ctaBtn}</Txt>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: palette.white,
    paddingVertical: 28,
    // Web .kt-wrap gutter (index.css --gutter: 32px).
    paddingHorizontal: 32,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.68, // .14em
    textTransform: "uppercase",
  },
  // Web: mt-3 max-w-[16ch] text-4xl.
  h2: { marginTop: 12, maxWidth: "94%", fontSize: 34, lineHeight: 40 },
  grid: {
    marginTop: 40,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 190,
    borderRadius: 22,
    padding: 16,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  cardWide: { flexBasis: "100%" },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  num: {
    // Web: text-3xl (30px).
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 32,
    fontFamily: ktFont(700),
  },
  cardBody: { marginTop: 16 },
  ctaBtn: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: palette.white,
    paddingHorizontal: 28,
    paddingVertical: 13,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
});
