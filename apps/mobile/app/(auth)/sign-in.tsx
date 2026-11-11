/* Web auth page port (apps/web/public/signin.html + auth.css). Phone shows
 * the form column only (the right showcase panel is display:none ≤960px).
 * Same pieces: brandmark (34px logo), h1, .sub, fields (radius 10, border
 * #e2e4e9), error line (#B3261E), primary #232323 radius 12, foot link.
 * auth.css ships tighter RTL type (Arabic glyphs render larger) — mirrored
 * via the isAr style builder. */

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { Image } from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLang } from "../../src/lang";
import { signInWithDb } from "../../src/authDb";
import { ktFont } from "../../src/theme";
import { Txt } from "../../src/components/Txt";

const LOGO = require("../../assets/logo.png");

export default function SignIn() {
  const { t, lang } = useLang();
  const a = t.auth;
  const insets = useSafeAreaInsets();
  const st = mkStyles(lang === "ar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    setErr("");
    const clean = email.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
    if (!clean || !password) return;
    setBusy(true);
    try {
      await signInWithDb(clean, password);
      router.replace("/dashboard" as never);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "";
      setErr(
        msg.includes("no longer exists")
          ? a.errNoAccount
          : msg.includes("timed out")
            ? `Sign-in ${a.errTimeout}`
            : a.errGeneric,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: 32 + insets.top, paddingBottom: 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandmark}>
            <Image source={LOGO} style={styles.brandLogo} />
          </View>
          <Txt style={st.h1}>{a.inH1}</Txt>
          <Txt variant="small" style={st.sub}>
            {a.inSub}
          </Txt>

          <View style={styles.form}>
            <View style={styles.field}>
              <Txt style={st.label}>{a.email}</Txt>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={a.emailPh}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                style={st.input}
                placeholderTextColor="#9aa0aa"
              />
            </View>
            <View style={styles.field}>
              <Txt style={st.label}>{a.pw}</Txt>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={a.pwPh}
                secureTextEntry
                textContentType="password"
                onSubmitEditing={() => void submit()}
                style={st.input}
                placeholderTextColor="#9aa0aa"
              />
            </View>

            {err !== "" && (
              <Txt style={st.err} accessibilityRole="alert">
                {err}
              </Txt>
            )}

            <View style={styles.primaryWrap}>
              <Txt
                onPress={() => void submit()}
                style={[st.primary, busy && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityState={{ busy }}
              >
                {busy ? "…" : a.inSubmit}
              </Txt>
            </View>
          </View>

          <Txt style={st.foot}>
            {a.inFootPre}
            <Txt
              style={st.footLink}
              onPress={() => router.replace("/sign-up" as never)}
              accessibilityRole="link"
            >
              {a.inFootLink}
            </Txt>
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  scroll: {
    paddingHorizontal: 24,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  brandmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  form: {
    marginTop: 26,
    gap: 22,
  },
  field: { gap: 9 },
  primaryWrap: { marginTop: 4 },
});

/** auth.css RTL block: Arabic glyphs render larger, so type scales down. */
function mkStyles(isAr: boolean): Record<string, TextStyle> {
  return StyleSheet.create({
    h1: {
      fontSize: isAr ? 28 : 34,
      fontWeight: "700",
      lineHeight: isAr ? 34 : 40,
      letterSpacing: isAr ? 0 : -0.3,
      fontFamily: ktFont(700, isAr),
      color: "#111",
    },
    sub: {
      marginTop: 14,
      fontSize: isAr ? 14.5 : 16,
      lineHeight: isAr ? 22 : 24,
      color: "#4b5563",
      maxWidth: 460,
    },
    label: {
      fontSize: isAr ? 13 : 15.5,
      fontWeight: "700",
      color: "#111",
    },
    input: {
      borderWidth: 1,
      borderColor: "#e2e4e9",
      borderRadius: 10,
      backgroundColor: "#fff",
      paddingHorizontal: 15,
      paddingVertical: 13,
      fontSize: isAr ? 13 : 15.5,
      fontFamily: ktFont(500, isAr),
      color: "#111",
    },
    err: {
      color: "#B3261E",
      fontSize: 14,
      fontWeight: "700",
    },
    primary: {
      width: "100%",
      textAlign: "center",
      borderRadius: 12,
      backgroundColor: "#232323",
      color: "#fff",
      fontSize: isAr ? 16 : 17.5,
      fontWeight: "500",
      paddingVertical: 15,
      overflow: "hidden",
      fontFamily: ktFont(500, isAr),
    },
    foot: {
      marginTop: 20,
      textAlign: "center",
      fontSize: isAr ? 13 : 15.5,
      color: "#6b7280",
    },
    footLink: {
      color: "#f97316",
      fontWeight: "600",
      fontSize: isAr ? 13 : 15.5,
    },
  });
}
