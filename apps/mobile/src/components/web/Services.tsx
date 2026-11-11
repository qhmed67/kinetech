/* Web Services port (apps/web/src/components/Services.tsx): info side
 * (counter, h3, desc, checkrows) + phone mockup preview with auto-advance
 * carousel (5s), arrows below (mobile web layout), CTA. */

import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useLang } from "../../lang";
import { palette } from "../../theme";
import { CheckRow, Chev, Eyebrow, Motif } from "./bits";
import { Txt } from "../Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";

function SigBars() {
  return (
    <Svg width={17} height={12} viewBox="0 0 17 12" fill={palette.black}>
      <Rect x="0" y="7" width="3" height="5" rx="1" />
      <Rect x="4.5" y="5" width="3" height="7" rx="1" />
      <Rect x="9" y="2.5" width="3" height="9.5" rx="1" />
      <Rect x="13.5" y="0" width="3" height="12" rx="1" />
    </Svg>
  );
}

function WifiIcon() {
  return (
    <Svg width={16} height={12} viewBox="0 0 16 12" fill="none">
      <Path d="M1.8 4.6a8.6 8.6 0 0 1 12.4 0" stroke={palette.black} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M4 7a5.6 5.6 0 0 1 8 0" stroke={palette.black} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="8" cy="9.8" r="1.3" fill={palette.black} />
    </Svg>
  );
}

function BatteryIcon() {
  return (
    <Svg width={25} height={12} viewBox="0 0 27 12" fill="none">
      <Rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke={palette.black} opacity={0.45} />
      <Rect x="2.5" y="2.5" width="15.5" height="7" rx="2" fill={palette.black} />
      <Rect x="24" y="3.5" width="2.5" height="5" rx="1.2" fill={palette.black} opacity={0.45} />
    </Svg>
  );
}

const PREVIEW_BG = [
  "rgba(110,78,156,0.16)",
  "rgba(59,188,217,0.20)",
  "rgba(127,99,158,0.18)",
  "rgba(61,50,80,0.12)",
];

function PhonePreview({ active, titles, motifs }: { active: number; titles: string[]; motifs: number[] }) {
  const cur = active % 4;
  return (
    <View style={styles.phoneOuter}>
      {/* side buttons */}
      <View style={[styles.sideBtn, styles.volUp]} />
      <View style={[styles.sideBtn, styles.volDown]} />
      <View style={[styles.sideBtn, styles.power]} />
      <View style={styles.phone}>
        <View style={styles.statusRow}>
          <Text style={styles.statusTime}>9:41</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <SigBars />
            <WifiIcon />
            <BatteryIcon />
          </View>
        </View>
        {/* notch */}
        <View style={styles.notch}>
          <View style={styles.notchDot} />
        </View>
        <View style={styles.screen}>
          {/* dot texture */}
          <View style={styles.dotTexture} pointerEvents="none" />
          <View style={styles.screenInner}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
              <View style={styles.numBadge}>
                <Txt style={{ color: palette.white, fontSize: 11, fontWeight: "700" }}>
                  {String(cur + 1).padStart(2, "0")}
                </Txt>
              </View>
              <Txt style={{ color: palette.accent, fontSize: 14, fontWeight: "700" }}>
                {titles[cur]}
              </Txt>
            </View>
            <View style={[styles.appPreview, { backgroundColor: PREVIEW_BG[cur % 4] }]}>
              <Motif index={motifs[cur]} size={80} color={cur % 4 === 1 ? palette.deep : palette.accent} />
              <View style={[styles.floatChip, styles.floatChipTop]}>
                <View style={styles.skelLineShort} />
                <View style={[styles.skelLine, { width: 36 }]} />
              </View>
              <View style={[styles.floatChip, styles.floatChipBottom]}>
                <View style={styles.skelDot} />
                <View style={[styles.skelLine, { width: 64 }]} />
              </View>
            </View>
            <View style={{ gap: 8, paddingHorizontal: 4 }}>
              <View style={[styles.skelLineTall, { width: "92%" }]} />
              <View style={[styles.skelLineTall, { width: "75%" }]} />
              <View style={[styles.skelLineTall, { width: "80%" }]} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 4 }}>
              <View style={[styles.tile, { flex: 1 }]} />
              <View style={[styles.tile, { flex: 1 }]} />
              <View style={[styles.tile, { flex: 1 }]} />
            </View>
            <View style={{ gap: 8, paddingHorizontal: 4 }}>
              <View style={[styles.skelLineTall, { width: "66%" }]} />
              <View style={[styles.skelLineTall, { width: "50%" }]} />
            </View>
            {/* bottom tab nav */}
            <View style={styles.phoneNav}>
              {motifs.map((m, i) => (
                <View
                  key={i}
                  style={[styles.phoneNavBtn, i === cur && styles.phoneNavActive]}
                >
                  <Motif index={m} size={20} color={i === cur ? palette.white : "rgba(26,26,26,0.3)"} />
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function Services() {
  const { t } = useLang();
  const s = t.services;
  const slides = useMemo(
    () => [
      { title: s.crsT, desc: s.crsD, items: s.crsI, motif: 3 },
      { title: s.mktT, desc: s.mktD, items: s.mktI, motif: 0 },
      { title: s.softT, desc: s.softD, items: s.softI, motif: 1 },
      { title: s.desT, desc: s.desD, items: s.desI, motif: 2 },
    ],
    [s],
  );
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % slides.length), 5000);
    return () => clearInterval(id);
  }, [slides.length]);

  const go = (dir: 1 | -1) => setActive((a) => (a + dir + slides.length) % slides.length);
  const cur = slides[active];

  return (
    <View style={styles.section}>
      <Eyebrow>{s.eyebrow}</Eyebrow>
      <Txt variant="h2">{s.h2}</Txt>
      <View style={styles.grid}>
        {/* info side */}
        <View style={{ flex: 1, minWidth: 260 }}>
          <View style={styles.info}>
            <Txt variant="meta" tone="accent" style={{ fontWeight: "700" }}>
              {String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
            </Txt>
            <Txt style={{ fontSize: 28, fontWeight: "700", marginTop: 8 }}>{cur.title}</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: 12 }}>
              {cur.desc}
            </Txt>
            <View style={{ gap: 12, marginTop: 18 }}>
              {cur.items.map((item) => (
                <CheckRow key={item}>{item}</CheckRow>
              ))}
            </View>
          </View>
          <PhonePreview active={active} titles={slides.map((x) => x.title)} motifs={slides.map((x) => x.motif)} />
          {/* mobile controls — below the phone, thumb-first */}
          <View style={styles.controls}>
            <Pressable onPress={() => go(-1)} style={styles.arrowBtn} accessibilityLabel="Previous service">
              <Chev size={20} color={palette.fg} />
            </Pressable>
            <Pressable onPress={() => go(1)} style={styles.arrowBtn} accessibilityLabel="Next service">
              <Chev next size={20} color={palette.fg} />
            </Pressable>
            <Button
              title={s.noteCta}
              variant="primary"
              onPress={() => void Linking.openURL(WA).catch(() => {})}
              style={{ marginLeft: 8, flex: 1 }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    // Web .section padding-block: clamp(48px, 7vw, ...) -> 48px on phones.
    paddingVertical: 48,
    // Web .kt-wrap gutter (index.css --gutter: 32px).
    paddingHorizontal: 32,
  },
  grid: { marginTop: 24 },
  info: { minHeight: 220 },
  controls: {
    marginTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneOuter: {
    alignSelf: "center",
    marginTop: 32,
    marginBottom: 8,
  },
  phone: {
    width: 280,
    borderRadius: 48,
    backgroundColor: palette.black,
    padding: 11,
    shadowColor: palette.deep,
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 28 },
    elevation: 12,
  },
  sideBtn: {
    position: "absolute",
    width: 3,
    height: 56,
    borderRadius: 999,
    backgroundColor: palette.black,
  },
  volUp: { left: -3, top: 160 },
  volDown: { left: -3, top: 224 },
  power: { right: -3, top: 176 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  statusTime: {
    fontSize: 13.5,
    fontWeight: "700",
    color: palette.black,
    fontFamily: "System",
  },
  notch: {
    position: "absolute",
    left: "50%",
    top: 10,
    marginLeft: -34,
    width: 68,
    height: 24,
    borderRadius: 999,
    backgroundColor: palette.black,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 8,
    zIndex: 2,
  },
  notchDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#1b1b1f",
    borderWidth: 1.5,
    borderColor: "#5a5a62",
  },
  screen: {
    borderRadius: 36,
    backgroundColor: palette.white,
    overflow: "hidden",
    marginTop: 2,
  },
  dotTexture: {
    ...StyleSheet.absoluteFill,
    opacity: 0.7,
  },
  screenInner: {
    minHeight: 540,
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 16,
    backgroundColor: "#F6F6F8",
  },
  numBadge: {
    borderRadius: 999,
    backgroundColor: palette.deep,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  appPreview: {
    height: 160,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
    overflow: "hidden",
  },
  floatChip: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  floatChipTop: { right: 12, top: 12 },
  floatChipBottom: { left: 12, bottom: 12, flexDirection: "row", alignItems: "center" },
  skelLine: { height: 8, borderRadius: 4, backgroundColor: "rgba(26,26,26,0.12)", width: 56 },
  skelLineShort: { height: 8, borderRadius: 4, backgroundColor: "rgba(26,26,26,0.12)", width: 44 },
  skelLineTall: { height: 12, borderRadius: 6, backgroundColor: "rgba(26,26,26,0.1)" },
  skelDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  tile: { height: 64, borderRadius: 12, backgroundColor: "rgba(26,26,26,0.08)" },
  phoneNav: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f5f5f5",
    backgroundColor: palette.white,
    padding: 6,
    shadowColor: palette.black,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  phoneNavBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneNavActive: { backgroundColor: palette.deep },
});
