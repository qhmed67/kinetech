/* Web ContactPage port (apps/web/src/pages/ContactPage.tsx): eyebrow + h1 +
 * lead, bordered form card (name/email grid, message, send, sent note),
 * WhatsApp foot note. The web form is demo-only (no backend submit) — same
 * honest behavior here. */

import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLang } from "../src/lang";
import { ktFont, palette } from "../src/theme";
import { Footer } from "../src/components/web/Footer";
import { TopBar } from "../src/components/web/TopBar";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  style?: object;
}) {
  return (
    <View style={[{ gap: 7 }, style]}>
      <Txt variant="small" style={{ fontWeight: "700" }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.textarea]}
        placeholderTextColor="#9aa0aa"
      />
    </View>
  );
}

export default function ContactPageScreen() {
  const { t } = useLang();
  const c = t.contactPage;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <View style={styles.root}>
      <TopBar />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 0 }} keyboardShouldPersistTaps="handled">
          <View style={styles.wrap}>
            <Txt style={styles.eyebrow}>{c.eyebrow}</Txt>
            <Txt variant="h2">{c.h2}</Txt>
            <Txt variant="lead" style={{ marginTop: 12 }}>
              {c.sub}
            </Txt>

            <View style={styles.form}>
              <View style={styles.frow}>
                <Field label={c.nameL} value={name} onChangeText={setName} />
                <Field
                  label={c.emailL}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
              </View>
              <Field label={c.msgL} value={msg} onChangeText={setMsg} multiline />
              <Button
                title={c.send}
                variant="primary"
                onPress={() => setSent(true)}
                style={styles.sendBtn}
              />
              {sent && (
                <Txt variant="small" style={styles.sent} accessibilityRole="alert">
                  {c.sent}
                </Txt>
              )}
            </View>

            <Txt variant="small" tone="muted" style={styles.waT}>
              {c.waT}{" "}
              <Txt
                variant="small"
                tone="accent"
                style={{ fontWeight: "700" }}
                onPress={() => void Linking.openURL(WA).catch(() => {})}
              >
                WhatsApp
              </Txt>
            </Txt>
          </View>

          <Footer />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  wrap: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 14,
    fontFamily: ktFont(700),
  },
  form: {
    marginTop: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 24,
    gap: 16,
  },
  frow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e4e9",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: ktFont(500),
    color: "#111",
    minHeight: 44,
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  sendBtn: {
    alignSelf: "flex-start",
  },
  sent: {
    color: palette.accent,
    fontWeight: "700",
  },
  waT: {
    marginTop: 24,
    textAlign: "center",
  },
});
