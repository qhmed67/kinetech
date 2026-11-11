import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Input } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import { signUpWithDb } from "../../src/authDb";
import { Screen } from "../../src/components/Screen";
import { Txt } from "../../src/components/Txt";
import { palette } from "../../src/theme";

export default function SignUp() {
  const { t, lang } = useLang();
  const router = useRouter();
  const a = t.auth;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await signUpWithDb({
        email: email.trim(),
        password,
        name: `${firstName} ${lastName}`.trim(),
        phone: phone.trim(),
        track: "courses",
      });
      router.replace("/sign-in");
    } catch (e) {
      setError(
        lang === "ar"
          ? "تعذّر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى."
          : "Couldn't create the account. Check your details and try again.",
      );
      void e;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.form}>
        <View style={styles.fields}>
          <Input
            value={firstName}
            onChangeText={setFirstName}
            placeholder={a.firstNamePh}
            style={styles.input}
          />
          <Input
            value={lastName}
            onChangeText={setLastName}
            placeholder={a.lastNamePh}
            style={styles.input}
          />
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder={a.emailPh}
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign={lang === "ar" ? "right" : "left"}
            style={styles.input}
          />
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder={a.phonePh}
            keyboardType="phone-pad"
            textAlign={lang === "ar" ? "right" : "left"}
            style={styles.input}
          />
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={a.passwordPh}
            secureTextEntry
            textAlign={lang === "ar" ? "right" : "left"}
            style={styles.input}
          />
        </View>

        {error ? (
          <Txt variant="small" tone="accent" center>
            {error}
          </Txt>
        ) : null}

        <Button title={a.signUpBtn} onPress={() => void onSubmit()} loading={loading} />

        <View style={styles.footer}>
          <Txt variant="small" style={styles.signIn}>
            {a.haveAccount}{" "}
            <Txt variant="small" tone="accent" onPress={() => router.replace("/sign-in")}>
              {a.signInBtn}
            </Txt>
          </Txt>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    padding: 22,
    paddingTop: 32,
    gap: 20,
  },
  fields: {
    gap: 12,
  },
  input: {
    backgroundColor: palette.surface,
  },
  footer: {
    alignItems: "center",
    marginTop: 8,
  },
  signIn: {
    color: palette.fg,
  },
});
