/* Web Footer port (apps/web/src/components/Footer.tsx) — .pagefoot clone:
 * logo + wordmark, quick nav, phone (tabular-nums), social buttons, rights
 * + legal links. */

import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useLang } from "../../lang";
import { ktFont, palette } from "../../theme";
import { Txt } from "../Txt";

const LOGO = require("../../../assets/logo.png");

export const WA_LINK = "https://wa.me/201042031062";
export const FB_LINK = "https://www.facebook.com/profile.php?id=61588373937044";

function FbIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={palette.accent}>
      <Path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H8.5v3H11v7z" />
    </Svg>
  );
}

function WaIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke={palette.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function YtIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" stroke={palette.accent} strokeWidth="1.9" />
      <Path d="m10 15 5-3-5-3z" stroke={palette.accent} strokeWidth="1.9" strokeLinejoin="round" />
    </Svg>
  );
}

function IgIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect width="18" height="18" x="3" y="3" rx="5" stroke={palette.accent} strokeWidth="1.9" />
      <Circle cx="12" cy="12" r="3.5" stroke={palette.accent} strokeWidth="1.9" />
      <Circle cx="17" cy="7" r="0.5" fill={palette.accent} />
    </Svg>
  );
}

export function Footer() {
  const { t } = useLang();
  const f = t.footer;

  const go = (route: string) => {
    void Linking.openURL(`https://kinetechtest.vercel.app/#${route}`).catch(() => {});
  };
  const soc = (href: string) => {
    void Linking.openURL(href).catch(() => {});
  };

  return (
    <View style={styles.pagefoot}>
      <View style={styles.inner}>
        <View style={styles.rowWrap}>
          <View style={styles.brandRow}>
            <Image source={LOGO} style={styles.logo} />
            <Txt style={{ fontSize: 16, fontWeight: "700", color: palette.fg }}>
              <Txt style={{ color: palette.accent, fontWeight: "700", fontSize: 16 }}>KINE</Txt>
              <Txt style={{ color: palette.teal, fontWeight: "700", fontSize: 16 }}>TECH</Txt>
            </Txt>
          </View>
          <View style={styles.navRow}>
            {[
              { label: t.nav.courses, route: "/courses" },
              { label: t.nav.baccalaureate, route: "/baccalaureate" },
              { label: t.misc.aboutH, route: "/about" },
              { label: t.contactPage.h2, route: "/contact" },
            ].map((l) => (
              <Pressable key={l.route} onPress={() => go(l.route)}>
                <Txt variant="small" tone="muted" style={styles.link}>
                  {l.label}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => soc("tel:+201042031062")}>
            <Txt variant="small" tone="muted" style={styles.phone}>
              {f.phone}
            </Txt>
          </Pressable>
          <View style={styles.socialRow}>
            <Pressable onPress={() => soc(FB_LINK)} style={styles.socialBtn} accessibilityLabel="Facebook">
              <FbIcon />
            </Pressable>
            <Pressable onPress={() => soc(WA_LINK)} style={styles.socialBtn} accessibilityLabel="WhatsApp">
              <WaIcon />
            </Pressable>
            <View style={[styles.socialBtn, styles.soon]} accessibilityLabel="YouTube — soon">
              <YtIcon />
            </View>
            <View style={[styles.socialBtn, styles.soon]} accessibilityLabel="Instagram — soon">
              <IgIcon />
            </View>
          </View>
        </View>
        <View style={styles.legalRow}>
          <Txt variant="meta" tone="muted">
            {f.rights}
          </Txt>
          <Pressable onPress={() => go("/privacy")}>
            <Txt variant="meta" tone="muted" style={styles.link}>
              {t.legal.privacyT}
            </Txt>
          </Pressable>
          <Pressable onPress={() => go("/terms")}>
            <Txt variant="meta" tone="muted" style={styles.link}>
              {t.legal.termsT}
            </Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pagefoot: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.white,
    // Web footer: py-5 (20px).
    paddingVertical: 20,
  },
  inner: {
    alignItems: "center",
    gap: 16,
    // Web .kt-wrap gutter (index.css --gutter: 32px).
    paddingHorizontal: 32,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 24,
    rowGap: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: { width: 30, height: 30, borderRadius: 15 },
  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 20,
    rowGap: 4,
  },
  link: {},
  phone: {
    fontFamily: ktFont(700),
    fontVariant: ["tabular-nums"],
  },
  socialRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  socialBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  soon: { opacity: 0.45 },
  legalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 16,
    rowGap: 4,
  },
});
