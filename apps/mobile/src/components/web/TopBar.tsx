/* Web TopNav port (apps/web/src/components/TopNav.tsx). Phone layout always
 * uses the drawer (the web's md-hidden burger); the desktop nav row becomes
 * quick links inside the drawer. Same brandlock (logo + KINE/TECH wordmark),
 * same lang toggle, same bell (unread badge #B3261E), same avatar menu. */

import { useEffect, useMemo, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useLang } from "../../lang";
import { useAuth } from "../../auth";
import { getNotifications, type Notification } from "../../lib/db/activity";
import { initialsOf } from "../../authDb";
import { ktFont, palette } from "../../theme";
import { Txt } from "../Txt";

const LOGO = require("../../../assets/logo.png");

function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <Text style={[styles.wordmark, { fontSize: size, letterSpacing: -0.04 * size }]}>
      <Text style={{ color: palette.accent }}>KINE</Text>
      <Text style={{ color: palette.teal }}>TECH</Text>
    </Text>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 20a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}

function BurgerIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M4 12h16M4 17h16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6l-12 12M6 6l12 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function TopBar() {
  const { t, lang, toggle } = useLang();
  const { user, signOut } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [shown] = useState(new Animated.Value(0));
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rtl = lang === "ar";
  // Web breakpoints (index.css / tailwind): the wordmark disappears below
  // 420px and the bell + sign-in link only exist from 640px up. Without this
  // the header overflows on phones and pushes the burger off-screen.
  const showWordmark = width >= 420;
  const showWideLinks = width >= 640;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: drawer ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [drawer, shown]);

  // Live notifications feed (web TopNav merges the same DB widget).
  useEffect(() => {
    let alive = true;
    if (!user) {
      setNotifs(null);
      setUnread(0);
      return;
    }
    getNotifications(6)
      .then((rows) => {
        if (!alive) return;
        setNotifs(rows);
        setUnread(rows.filter((r) => !r.is_read).length);
      })
      .catch(() => {
        if (alive) setNotifs([]);
      });
    return () => {
      alive = false;
    };
  }, [user, notifOpen]);

  const links = useMemo(
    () => [
      { route: "/courses" as const, label: t.nav.courses },
      { route: "/baccalaureate" as const, label: t.nav.baccalaureate },
      { route: "/about" as const, label: t.misc.aboutH },
      { route: "/contact" as const, label: t.contactPage.h2 },
    ],
    [t],
  );

  const go = (route: string) => {
    setDrawer(false);
    setNotifOpen(false);
    router.push(route as never);
  };

  const drawerTranslate = {
    transform: [
      {
        translateX: shown.interpolate({
          inputRange: [0, 1],
          outputRange: [rtl ? -360 : 360, 0],
        }),
      },
    ],
  };

  return (
    <View>
      <View style={[styles.topnav, { paddingTop: insets.top > 0 ? 0 : 8 }]}>
        <View style={[styles.inner, rtl && styles.innerLTR]}>
          <Pressable onPress={() => go("/")} style={styles.brandlock} accessibilityRole="link">
            <Image source={LOGO} style={styles.logo} />
            {showWordmark ? <Wordmark /> : null}
          </Pressable>
          <View style={styles.row}>
            <Pressable
              onPress={toggle}
              style={[styles.langToggle, styles.btnSecondary]}
              accessibilityRole="button"
              accessibilityLabel="Switch language"
            >
              <Txt variant="small" style={styles.btnText}>
                {t.toggle}
              </Txt>
            </Pressable>
            {user ? (
              <>
                {showWideLinks ? (
                  <Pressable
                    onPress={() => setNotifOpen((v) => !v)}
                    style={[styles.bellBtn, unread > 0 && styles.bellRing]}
                    accessibilityRole="button"
                    accessibilityLabel={t.dashboard.notifT}
                  >
                    <BellIcon color={palette.accent} />
                    {unread > 0 && (
                      <View style={styles.bellBadge}>
                        <Text style={styles.bellBadgeText}>{unread}</Text>
                      </View>
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => go("/dashboard")}
                  style={styles.avatarBtn}
                  accessibilityRole="button"
                  accessibilityLabel={user.name}
                >
                  <Text style={styles.avatarText}>{initialsOf(user.name)}</Text>
                </Pressable>
              </>
            ) : showWideLinks ? (
              <Pressable onPress={() => go("/sign-in")} accessibilityRole="link">
                <Txt variant="small" style={styles.navSignin}>
                  {t.nav.signin}
                </Txt>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setDrawer(true)}
              style={styles.burgerBtn}
              accessibilityRole="button"
              accessibilityLabel={t.menu}
            >
              <BurgerIcon color={palette.fg} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* bell dropdown */}
      {notifOpen && (
        <View style={[styles.notifPanel, rtl ? styles.notifPanelRtl : styles.notifPanelLtr, { top: 60 + insets.top }]}>
          {notifs === null ? (
            <View style={styles.notifLoading} />
          ) : notifs.length === 0 ? (
            <View style={styles.notifEmpty}>
              <Txt variant="small" tone="muted">
                {t.dashboard.notifEmpty}
              </Txt>
            </View>
          ) : (
            notifs.map((f, i) => (
              <Pressable
                key={f.id}
                onPress={() => {
                  setNotifOpen(false);
                  go("/dashboard");
                }}
                style={[styles.notifRow, i < notifs.length - 1 && styles.notifRowLine, { opacity: !f.is_read ? 1 : 0.7 }]}
              >
                <View style={[styles.notifDot, { backgroundColor: !f.is_read ? palette.teal : palette.line }]} />
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="small" style={{ fontWeight: "700" }}>
                    {f.title}
                  </Txt>
                  {!!f.message && (
                    <Txt variant="small" tone="muted">
                      {f.message}
                    </Txt>
                  )}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* drawer */}
      {drawer && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[styles.backdrop, { opacity: shown }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawer(false)} accessibilityLabel={t.menu} />
          </Animated.View>
          <Animated.View
            style={[
              styles.drawer,
              // Web: `inset-y-0 end-0` — the drawer sits on the inline end
              // (left in Arabic, right in English).
              rtl ? styles.drawerRtl : styles.drawerLtr,
              drawerTranslate,
              { paddingTop: 20 + insets.top },
            ]}
            accessibilityRole="dialog"
          >
            <View style={styles.drawerHead}>
              <Wordmark size={17} />
              <Pressable
                onPress={() => setDrawer(false)}
                style={styles.drawerClose}
                accessibilityRole="button"
              >
                <CloseIcon color={palette.fg} />
              </Pressable>
            </View>
            {links.map((l) => (
              <Pressable key={l.route} onPress={() => go(l.route)} style={styles.drawerLink}>
                <Txt variant="body" style={{ fontWeight: "700", color: palette.fg }}>
                  {l.label}
                </Txt>
              </Pressable>
            ))}
            <View style={styles.drawerDivider} />
            {user ? (
              <>
                <Pressable onPress={() => go("/dashboard")} style={styles.drawerLink}>
                  <Txt variant="body" style={{ fontWeight: "700", color: palette.fg }}>
                    {t.nav.myDashboard}
                  </Txt>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDrawer(false);
                    void signOut().finally(() => router.replace("/sign-in" as never));
                  }}
                  style={styles.drawerLink}
                >
                  <Txt variant="body" style={{ fontWeight: "700", color: palette.err }}>
                    {t.nav.signout}
                  </Txt>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => go("/sign-in")} style={styles.drawerPrimary}>
                <Txt variant="body" style={{ color: palette.white, fontWeight: "700" }}>
                  {t.nav.signin}
                </Txt>
              </Pressable>
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topnav: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  // Web keeps the header bar LTR (index.css .topnav-inner{direction:ltr}) so
  // the brand stays on the left in both languages.
  innerLTR: {
    flexDirection: "row-reverse",
  },
  brandlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.white,
  },
  wordmark: {
    fontWeight: "700",
    color: palette.fg,
    // Valley Sans via Txt auto-selection is bypassed here (inline Texts).
    fontFamily: ktFont(700),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
  },
  langToggle: {
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  btnText: { color: palette.fg, fontWeight: "700" },
  navSignin: {
    color: palette.muted,
    fontWeight: "700",
    paddingHorizontal: 6,
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(110,78,156,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellRing: {},
  bellBadge: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: palette.err,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: palette.white,
    fontSize: 11,
    fontWeight: "700",
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: palette.white,
    fontWeight: "700",
    fontSize: 14,
    fontFamily: ktFont(700),
  },
  burgerBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifPanel: {
    position: "absolute",
    width: 288,
    maxHeight: 320,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden",
    shadowColor: palette.black,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 120,
  },
  // Web: `absolute end-0` — the panel hugs the inline end of the header.
  notifPanelLtr: { right: 12 },
  notifPanelRtl: { left: 12 },
  notifLoading: {
    height: 72,
    margin: 12,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  notifEmpty: { paddingHorizontal: 16, paddingVertical: 12 },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  notifRowLine: {
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6,
    flexShrink: 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "86%",
    maxWidth: 320,
    backgroundColor: palette.white,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 4,
  },
  drawerLtr: {
    right: 0,
    borderLeftWidth: 1,
    borderLeftColor: palette.line,
  },
  drawerRtl: {
    left: 0,
    borderRightWidth: 1,
    borderRightColor: palette.line,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  drawerClose: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerLink: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: palette.line,
    marginVertical: 6,
  },
  drawerPrimary: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: palette.accent,
    paddingVertical: 13,
    alignItems: "center",
  },
});
