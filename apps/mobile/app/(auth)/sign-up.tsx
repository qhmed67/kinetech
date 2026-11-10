import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import { Screen } from "../../src/components/Screen";
import { Txt } from "../../src/components/Txt";
import { Input } from "../../src/components/Input";

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

  const onSubmit = async () => {
    setLoading(true);
    try {
      // TODO: Implement sign up logic
      console.log("Sign up:", { firstName, lastName, email, phone, password });
      router.replace("/sign-in");
    } catch (error) {
      console.error("Sign up error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.form}>
          <View style={styles.fields}>
            <Input
              label={a.firstName}
              value={firstName}
              onChangeText={setFirstName}
              placeholder={a.firstNamePh}
              leftIcon={<Ionicons name="person-outline" size={20} />}
            />
            
            <Input
              label={a.lastName}
              value={lastName}
              onChangeText={setLastName}
              placeholder={a.lastNamePh}
              leftIcon={<Ionicons name="person-outline" size={20} />}
            />
            
            <Input
              label={a.email}
              value={email}
              onChangeText={setEmail}
              placeholder={a.emailPh}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Ionicons name="mail-outline" size={20} />}
            />
            
            <Input
              label={a.phone}
              value={phone}
              onChangeText={setPhone}
              placeholder={a.phonePh}
              keyboardType="phone-pad"
              leftIcon={<Ionicons name="call-outline" size={20} />}
            />
            
            <Input
              label={a.password}
              value={password}
              onChangeText={setPassword}
              placeholder={a.passwordPh}
              secureTextEntry
              leftIcon={<Ionicons name="lock-closed-outline" size={20} />}
            />
          </View>
          
          <Button
            title={a.signUpBtn}
            onPress={onSubmit}
            loading={loading}
            style={styles.submit}
          />
          
          <View style={styles.footer}>
            <Txt variant="small" style={styles.signIn}>
              {a.haveAccount}{" "}
              <Txt
                variant="small"
                tone="accent"
                onPress={() => router.replace("/sign-in")}
              >
                {a.signInBtn}
              </Txt>
            </Txt>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  form: {
    flex: 1,
    padding: 22,
    gap: 24,
  },
  fields: {
    gap: 16,
  },
  submit: {
    marginTop: 8,
  },
  footer: {
    alignItems: "center",
    marginTop: 16,
  },
  signIn: {
    color: palette.fg,
  },
});