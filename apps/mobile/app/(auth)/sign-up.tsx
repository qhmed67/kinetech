/* Web auth page port (apps/web/public/signup.html + auth.css): brandmark,
 * h1 + sub, two-col field rows, track dropdown (custom .dd), student fields
 * (national ID + grade) shown for the courses track, error line, primary
 * #232323, foot link. Email-confirmation flows: mobile shows the web's
 * "Account created ✓" then routes to sign-in (same healing flow). */

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { Image } from "react-native";
import Svg, { Path } from "react-native-svg";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLang } from "../../src/lang";
import { signUpWithDb, type TrackId } from "../../src/authDb";
import { ktFont } from "../../src/theme";
import { Txt } from "../../src/components/Txt";

const LOGO = require("../../assets/logo.png");

const TRACK_OPTS: { key: TrackId; labelKey: "opt1" | "opt2" | "opt3" | "opt4" }[] = [
  { key: "courses", labelKey: "opt1" },
  { key: "marketing", labelKey: "opt2" },
  { key: "programming", labelKey: "opt3" },
  { key: "design", labelKey: "opt4" },
];

function ChevDown({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Tick() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginLeft: "auto" }}>
      <Path d="M4 12.5 9.5 18 20 6.5" stroke="#6E4E9C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function SignUp() {
  const { t, lang } = useLang();
  const a = t.auth;
  const insets = useSafeAreaInsets();
  const st = mkStyles(lang === "ar");
  const [fn, setFn] = useState("");
  const [ln, setLn] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [phone, setPhone] = useState("");
  const [track, setTrack] = useState<TrackId | null>(null);
  const [ddOpen, setDdOpen] = useState(false);
  const [natid, setNatid] = useState("");
  const [grade, setGrade] = useState<"" | "sec1" | "sec2">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (busy) return;
    setErr("");
    const clean = email.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
    if (!fn.trim() || !ln.trim() || !clean || pw.length < 8 || !phone.trim() || !track) {
      setErr(a.errGeneric);
      return;
    }
    const student = track === "courses";
    if (student && (natid.trim().length !== 14 || grade === "")) {
      setErr(a.errGeneric);
      return;
    }
    setBusy(true);
    try {
      await signUpWithDb({
        email: clean,
        password: pw,
        name: `${fn.trim()} ${ln.trim()}`.trim(),
        phone: phone.trim(),
        nationalId: student ? natid.trim() : undefined,
        grade: student ? (grade as "sec1" | "sec2") : undefined,
        track,
      });
      setDone(true);
      setTimeout(() => router.replace("/dashboard" as never), 900);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "";
      // Half-created recovery: account exists but profile setup never
      // finished (or user simply re-registers) — sign-in heals the profile.
      if (/already (registered|exists)|user already/i.test(msg)) {
        router.replace("/sign-in" as never);
        return;
      }
      setErr(msg.includes("timed out") ? `Sign-up ${a.errTimeout}` : a.upErrGeneric);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: 32 + insets.top, paddingBottom: 48 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandmark}>
            <Image source={LOGO} style={styles.brandLogo} />
          </View>
          <Txt style={st.h1}>{a.upH1}</Txt>
          <Txt variant="small" style={st.sub}>
            {a.upSub}
          </Txt>

          <View style={styles.form}>
            <View style={styles.frow}>
              <View style={styles.field}>
                <Txt style={st.label}>{a.fn}</Txt>
                <TextInput value={fn} onChangeText={setFn} placeholder={a.fnPh} textContentType="givenName" style={st.input} placeholderTextColor="#9aa0aa" />
              </View>
              <View style={styles.field}>
                <Txt style={st.label}>{a.ln}</Txt>
                <TextInput value={ln} onChangeText={setLn} placeholder={a.lnPh} textContentType="familyName" style={st.input} placeholderTextColor="#9aa0aa" />
              </View>
            </View>
            <View style={styles.frow}>
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
                <TextInput value={pw} onChangeText={setPw} placeholder={a.pwPh} secureTextEntry textContentType="newPassword" style={st.input} placeholderTextColor="#9aa0aa" />
              </View>
            </View>
            <View style={styles.frow}>
              <View style={styles.field}>
                <Txt style={st.label}>{a.phone}</Txt>
                <TextInput value={phone} onChangeText={setPhone} placeholder={a.phonePh} keyboardType="phone-pad" textContentType="telephoneNumber" style={st.input} placeholderTextColor="#9aa0aa" />
              </View>
              {/* custom track dropdown (web .dd) */}
              <View style={styles.field}>
                <Txt style={st.label}>{a.track}</Txt>
                <View>
                  <Pressable
                    onPress={() => setDdOpen((v) => !v)}
                    style={[styles.ddBtn, ddOpen && styles.ddBtnOpen, !track && styles.ddPlaceholder]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: ddOpen }}
                    accessibilityLabel={a.track}
                  >
                    <Txt style={[styles.ddBtnText, !track && { color: "#9aa0aa" }]}>
                      {track ? a[TRACK_OPTS.find((o) => o.key === track)!.labelKey] : a.trackPh}
                    </Txt>
                    <ChevDown color={ddOpen ? "#111" : "#6b7280"} />
                  </Pressable>
                  {ddOpen && (
                    <View style={styles.ddList}>
                      {TRACK_OPTS.map((o) => {
                        const sel = track === o.key;
                        return (
                          <Pressable
                            key={o.key}
                            onPress={() => {
                              setTrack(o.key);
                              setDdOpen(false);
                            }}
                            style={[styles.ddOpt, sel && styles.ddOptSel]}
                            accessibilityRole="option"
                            accessibilityState={{ selected: sel }}
                          >
                            <Txt style={[styles.ddOptText, sel && { fontWeight: "700" }]}>{a[o.labelKey]}</Txt>
                            {sel && <Tick />}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </View>

            {track === "courses" && (
              <View style={styles.frow}>
                <View style={styles.field}>
                  <Txt style={st.label}>{a.natId}</Txt>
                  <TextInput
                    value={natid}
                    onChangeText={(v) => setNatid(v.replace(/[^0-9]/g, "").slice(0, 14))}
                    placeholder={a.natIdPh}
                    keyboardType="number-pad"
                    maxLength={14}
                    style={st.input}
                    placeholderTextColor="#9aa0aa"
                  />
                </View>
                <View style={styles.field}>
                  <Txt style={st.label}>{a.grade}</Txt>
                  <View style={styles.gradeRow}>
                    {(["sec1", "sec2"] as const).map((g) => (
                      <Pressable
                        key={g}
                        onPress={() => setGrade(g)}
                        style={[styles.gradeBtn, grade === g && styles.gradeBtnOn]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: grade === g }}
                      >
                        <Txt style={[styles.ddBtnText, { fontWeight: "700", color: grade === g ? "#fff" : "#111" }]}>
                          {g === "sec1" ? a.g1 : a.g2}
                        </Txt>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {done ? (
              <Txt style={[st.err, { color: "#4d7c0f" }]} accessibilityRole="alert">
                {a.upSubmit === "Create account" ? "Account created ✓" : "تم إنشاء الحساب ✓"}
              </Txt>
            ) : (
              <>
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
                    {busy ? "…" : a.upSubmit}
                  </Txt>
                </View>
              </>
            )}
          </View>

          <Txt style={st.foot}>
            {a.upFootPre}
            <Txt
              style={st.footLink}
              onPress={() => router.replace("/sign-in" as never)}
              accessibilityRole="link"
            >
              {a.upFootLink}
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
    marginBottom: 14,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  form: {
    marginTop: 18,
    gap: 16,
  },
  frow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  field: {
    gap: 7,
    flexGrow: 1,
    flexBasis: "44%",
  },
  ddBtn: {
    borderWidth: 1,
    borderColor: "#e2e4e9",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
  },
  ddBtnOpen: { borderColor: "#111" },
  ddPlaceholder: {},
  ddBtnText: {
    fontSize: 14,
    color: "#111",
    flexShrink: 1,
  },
  ddList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8eaef",
    backgroundColor: "#fff",
    padding: 6,
    shadowColor: "#1a1a1a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 50,
  },
  ddOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 9,
  },
  ddOptSel: { backgroundColor: "#F4F3F6" },
  ddOptText: {
    fontSize: 14,
    color: "#1A1A1A",
    flexShrink: 1,
  },
  gradeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gradeBtn: {
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e4e9",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  gradeBtnOn: { backgroundColor: "#232323", borderColor: "#232323" },
  primaryWrap: { marginTop: 4 },
});

/** auth.css RTL block: Arabic glyphs render larger, so type scales down. */
function mkStyles(isAr: boolean): Record<string, TextStyle> {
  return StyleSheet.create({
    h1: {
      fontSize: isAr ? 26 : 30,
      fontWeight: "700",
      lineHeight: isAr ? 32 : 36,
      letterSpacing: isAr ? 0 : -0.3,
      fontFamily: ktFont(700, isAr),
      color: "#111",
    },
    sub: {
      marginTop: 10,
      fontSize: isAr ? 13 : 15,
      lineHeight: isAr ? 21 : 23,
      color: "#4b5563",
      maxWidth: 460,
    },
    label: {
      fontSize: isAr ? 13 : 14.5,
      fontWeight: "700",
      color: "#111",
    },
    input: {
      borderWidth: 1,
      borderColor: "#e2e4e9",
      borderRadius: 10,
      backgroundColor: "#fff",
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: isAr ? 13 : 14.5,
      fontFamily: ktFont(500, isAr),
      color: "#111",
      minHeight: 44,
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
      fontSize: isAr ? 15 : 16.5,
      fontWeight: "500",
      paddingVertical: 13,
      overflow: "hidden",
      fontFamily: ktFont(500, isAr),
    },
    foot: {
      marginTop: 14,
      textAlign: "center",
      fontSize: isAr ? 13 : 14.5,
      color: "#6b7280",
    },
    footLink: {
      color: "#f97316",
      fontWeight: "600",
      fontSize: isAr ? 13 : 14.5,
    },
  });
}
