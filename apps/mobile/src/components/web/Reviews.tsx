/* Web Reviews port (apps/web/src/components/Reviews.tsx): eyebrow + h2,
 * vertical marquee columns of .tcard quote cards (duplicate list + translateY
 * -50% loop, same as @keyframes scrollY), then the meta note. Phone shows
 * two columns (the web's hide-s third column is md+ only). */

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useLang } from "../../lang";
import { palette } from "../../theme";
import { Eyebrow } from "./bits";
import { Txt } from "../Txt";

type TCard = { q: string; n: string; r: string };

function initials(name: string) {
  const parts = name.split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function TCardView({ card, alt }: { card: TCard; alt?: boolean }) {
  return (
    <View style={[styles.tcard, alt && { backgroundColor: palette.surface }]}>
      <Txt variant="small" style={{ lineHeight: 21 }}>
        {card.q}
      </Txt>
      <View style={styles.revWho}>
        <View style={styles.monogram}>
          <Txt style={{ color: palette.white, fontSize: 16, fontWeight: "700" }}>
            {initials(card.n)}
          </Txt>
        </View>
        <View>
          <Txt variant="meta" style={{ fontWeight: "700", color: palette.fg }}>
            {card.n}
          </Txt>
          <Txt variant="meta" tone="muted">
            {card.r}
          </Txt>
        </View>
      </View>
    </View>
  );
}

function Track({ cards, durMs, altStart }: { cards: TCard[]; durMs: number; altStart?: boolean }) {
  const y = useRef(new Animated.Value(0)).current;
  const [half, setHalf] = useState(0);
  // Content height = one full list; loop translates by exactly -half for a
  // seamless wrap (same as the web's translateY(-50%) keyframe).
  const onLayout = (h: number) => {
    if (Math.abs(h / 2 - half) > 1) setHalf(h / 2);
  };
  useEffect(() => {
    if (half <= 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -half, duration: durMs, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [half, durMs, y]);
  return (
    <View style={styles.mcol}>
      <Animated.View
        style={{ transform: [{ translateY: y }] }}
        onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
      >
        {[...cards, ...cards].map((c, i) => (
          <TCardView key={`${c.n}-${i}`} card={c} alt={altStart ? i % 2 === 1 : i % 2 === 0} />
        ))}
      </Animated.View>
    </View>
  );
}

export function Reviews() {
  const { t } = useLang();
  const r = t.reviews;
  return (
    <View style={styles.section} accessibilityLabel="User testimonials">
      <Eyebrow>{r.eyebrow}</Eyebrow>
      <Txt variant="h2" style={{ maxWidth: "88%" }}>
        {r.h2}
      </Txt>
      <View style={styles.marquee}>
        <Track cards={r.cards.slice(0, 3)} durMs={24000} />
        <Track cards={r.cards.slice(3, 6)} durMs={30000} altStart />
      </View>
      <Txt variant="meta" tone="muted" style={{ marginTop: 28 }}>
        {r.note}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: palette.surface,
    // Web .section padding-block: clamp(48px, 7vw, ...) -> 48px on phones.
    paddingVertical: 48,
    // Web .kt-wrap gutter (index.css --gutter: 32px).
    paddingHorizontal: 32,
  },
  marquee: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 32,
    height: 480,
    overflow: "hidden",
  },
  mcol: { width: 280, maxWidth: "46%" },
  tcard: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 32,
    padding: 26,
    marginBottom: 24,
  },
  revWho: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  monogram: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
