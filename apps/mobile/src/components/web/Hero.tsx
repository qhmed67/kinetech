/* Web Hero port (apps/web/src/components/Hero.tsx): the wavy-backed demo
 * hero — animated word build of t1 (fg) + t2 (accent), lead, two pill CTAs
 * (WhatsApp / services). Waves approximated with soft SVG curves in the
 * same WAVE_COLORS at the same opacity. */

import { useEffect, useRef } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useLang } from "../../lang";
import { ktFont, palette } from "../../theme";
import { Txt } from "../Txt";

const WA = "https://wa.me/201042031062";

const WAVE_COLORS = ["#927BB3", "#7F639E", "#6E4E9C", "#472885", "#3BBCD9"];

function WaveLines() {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(y, {
        toValue: 1,
        duration: 60000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={{
          flex: 1,
          opacity: 0.35,
          transform: [
            {
              translateX: y.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -160],
              }),
            },
          ],
        }}
      >
        <Svg width="200%" height="100%" viewBox="0 0 1440 620" preserveAspectRatio="none" fill="none">
          <Path d="M0 140 C 240 60, 480 220, 720 140 S 1200 60, 1440 140 V 620 H 0 Z" fill={WAVE_COLORS[0]} opacity={0.5} />
          <Path d="M0 260 C 260 180, 520 340, 780 260 S 1240 180, 1440 260 V 620 H 0 Z" fill={WAVE_COLORS[2]} opacity={0.4} />
          <Path d="M0 400 C 280 320, 560 480, 840 400 S 1280 320, 1440 400 V 620 H 0 Z" fill={WAVE_COLORS[3]} opacity={0.3} />
          <Path d="M0 520 C 300 440, 600 600, 900 520 S 1300 440, 1440 520 V 620 H 0 Z" fill={WAVE_COLORS[4]} opacity={0.25} />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Word({
  word,
  delay,
  accent,
  rtl,
  size,
}: {
  word: string;
  delay: number;
  accent: boolean;
  rtl: boolean;
  size: number;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 300,
      delay,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [a, delay]);
  return (
    <Animated.Text
      style={[
        styles.h1Word,
        {
          fontSize: size,
          lineHeight: Math.round(size * 1.18),
          // Web zeroes tracking on Arabic headings (html[dir=rtl] h1).
          letterSpacing: rtl ? 0 : -0.5,
          // Web spaces the words with `me-2` (inline-end margin).
          marginLeft: rtl ? 8 : 0,
          marginRight: rtl ? 0 : 8,
          opacity: a,
          color: accent ? "#6E4E9C" : "#1A1A1A",
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {word}
    </Animated.Text>
  );
}

export function Hero() {
  const { t, lang } = useLang();
  const h = t.hero;
  const lead = useRef(new Animated.Value(0)).current;
  const ctas = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const rtl = lang === "ar";
  // Web hero type scale: text-2xl (24) -> md:text-4xl (36) -> lg:text-6xl (60).
  const h1Size = width >= 1024 ? 60 : width >= 768 ? 36 : 24;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(lead, { toValue: 1, duration: 300, delay: 800, useNativeDriver: true }),
      Animated.timing(ctas, { toValue: 1, duration: 300, delay: 200, useNativeDriver: true }),
    ]).start();
  }, [lead, ctas]);

  const words1 = h.t1.split(" ");
  const words2 = h.t2.split(" ");

  return (
    <View style={styles.hero}>
      <WaveLines />
      <View style={styles.inner}>
        <View style={styles.h1}>
          {words1.map((word, i) => (
            <Word key={`a-${i}`} word={word} delay={i * 100} accent={false} rtl={rtl} size={h1Size} />
          ))}
          {words2.map((word, i) => (
            <Word key={`b-${i}`} word={word} delay={(words1.length + i) * 100} accent rtl={rtl} size={h1Size} />
          ))}
        </View>
        <Animated.View style={{ opacity: lead }}>
          <Txt variant="lead" style={styles.lead}>
            {h.lead}
          </Txt>
        </Animated.View>
        <Animated.View style={[styles.ctaRow, { opacity: ctas }]}>
          <Pressable
            onPress={() => void Linking.openURL(WA).catch(() => {})}
            style={styles.cta1}
            accessibilityRole="link"
          >
            <Txt style={{ color: palette.white, fontWeight: "700", fontSize: 15 }}>{h.cta1}</Txt>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL("https://kinetechtest.vercel.app/#services").catch(() => {})}
            style={styles.cta2}
            accessibilityRole="link"
          >
            <Txt style={{ color: palette.fg, fontWeight: "700", fontSize: 15 }}>{h.cta2}</Txt>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: "hidden",
    backgroundColor: palette.white,
  },
  inner: {
    alignItems: "center",
    // Web: px-4 pt-8 pb-3 (md:pt-12 md:pb-5).
    paddingTop: 32,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  h1: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: 640,
  },
  h1Word: {
    fontWeight: "700",
    fontFamily: ktFont(700),
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  lead: {
    color: palette.deep,
    textAlign: "center",
    maxWidth: 520,
    fontSize: 18,
    lineHeight: 28,
    marginTop: 32,
    marginBottom: 16,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 32,
  },
  cta1: {
    width: 240,
    borderRadius: 999,
    backgroundColor: palette.accent,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: palette.accent,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cta2: {
    width: 240,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: "center",
  },
});
