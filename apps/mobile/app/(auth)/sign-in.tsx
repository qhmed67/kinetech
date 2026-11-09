import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { getSupabase } from "../../src/lib/supabase";
import { color, font } from "@kinetech/tokens";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSignIn() {
    setError(null);
    setLoading(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Not configured");
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: color.bg }]}>
      <Text style={[styles.title, { color: color.fg, fontFamily: font.body }]}>Sign in</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="youremail@yourdomain.com"
        placeholderTextColor={color.muted}
        style={[styles.input, { borderColor: color.border, color: color.fg, backgroundColor: color.bg }]}
        accessibilityLabel="Email"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor={color.muted}
        style={[styles.input, { borderColor: color.border, color: color.fg, backgroundColor: color.bg }]}
        accessibilityLabel="Password"
      />
      {error ? <Text style={[styles.error, { color: color.accent }]}>{error}</Text> : null}
      <Pressable
        onPress={onSignIn}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
        style={[styles.button, { backgroundColor: color.accent, minHeight: 44 }]}
      >
        <Text style={[styles.buttonText, { color: color.bg }]}>{loading ? "…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 44, fontSize: 16 },
  error: { textAlign: "center" },
  button: { borderRadius: 999, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  buttonText: { fontWeight: "700", fontSize: 16 },
});
