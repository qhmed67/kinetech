import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Input } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import { useAuth } from "../../src/auth";
import { signInWithDb } from "../../src/authDb";
import { palette } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Txt } from "../../src/components/Txt";

export default function SignIn() {
  const { t, lang } = useLang();
  const { refresh } = useAuth();
  const router = useRouter();
  const a = t.auth;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rtl = lang === "ar";
  const align = rtl ? ("right" as const) : ("left" as const);

  const onSubmit = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      setError(a.errRequired);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithDb(email.trim(), password);
      // AuthProvider reloaded via notifyUserChanged(); refresh() makes it
      // deterministic before we leave this screen.
      await refresh();
      router.replace("/(tabs)");
    } catch {
      // Honest, non-technical message — never echoes server details.
      setError(a.errInvalid);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Txt
          variant="small"
          tone="accent"
          onPress={() => router.replace("/(tabs)")}
          accessibilityRole="link"
          style={styles.back}
        >
          {t.nav.home}
        </Txt>

        <View style={styles.card}>
          <Txt variant="h2">{a.signInBtn}</Txt>
          <Txt variant="small" style={styles.sub}>
            {t.home.sub}
          </Txt>

          <Input
            value={email}
            onChangeText={setEmail}
            placeholder={a.emailPh}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textAlign={align}
            editable={!loading}
            style={styles.input}
          />
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={a.passwordPh}
            secureTextEntry
            autoCapitalize="none"
            textAlign={align}
            editable={!loading}
            style={styles.input}
          />

          {error ? (
            <Txt variant="small" tone="accent" accessibilityLiveRegion="polite">
              {error}
            </Txt>
          ) : null}

          <Button
            title={a.signInBtn}
            onPress={() => void onSubmit()}
            loading={loading}
          />

          <Txt variant="small" style={styles.switchLine}>
            {a.haveAccount}{" "}
            <Txt
              variant="small"
              tone="accent"
              onPress={() => router.replace("/sign-up")}
              accessibilityRole="link"
            >
              {a.signUpBtn}
            </Txt>
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: 22,
    paddingTop: 18,
  },
  back: { marginBottom: 16 },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 22,
    padding: 22,
    backgroundColor: palette.bg,
  },
  sub: { color: palette.muted, marginTop: -6 },
  input: {
    backgroundColor: palette.surface,
  },
  switchLine: {
    textAlign: "center",
    color: palette.muted,
    marginTop: 4,
  },
});
