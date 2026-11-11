import { StyleSheet, View } from "react-native";
import { ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import { useAuth } from "../../src/auth";
import { palette } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Txt } from "../../src/components/Txt";
import { Footer } from "../../src/components/Footer";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

export default function Home() {
  const { t, lang } = useLang();
  const { user, ready } = useAuth();
  const router = useRouter();
  const h = t.home;

  if (!ready) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Screen>
    );
  }

  if (user) {
    return (
      <Screen>
        <View style={styles.hero}>
          <Txt variant="meta" tone="accent" center>
            {h.eyebrow}
          </Txt>
          <Txt variant="h2" center>
            {h.welcome}
          </Txt>
          <Txt variant="small" center style={styles.heroSub}>
            {user.name || user.email}
          </Txt>
        </View>

        <View style={styles.actions}>
          <Button
            title={h.openDashboard}
            onPress={() => router.push("/(tabs)/dashboard")}
            style={styles.cta}
          />
          <Button
            title={h.openCourses}
            variant="secondary"
            onPress={() => router.push("/(tabs)/courses")}
          />
        </View>

        <Footer />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.brandMark}>
          <Ionicons name="school" size={26} color={palette.white} />
        </View>
        <Txt variant="meta" tone="accent" center>
          {h.eyebrow}
        </Txt>
        <Txt variant="h2" center>
          {h.title}
        </Txt>
        <Txt variant="small" center style={styles.heroSub}>
          {h.sub}
        </Txt>
      </View>

      <View style={styles.actions}>
        <Button
          title={h.ctaSignIn}
          onPress={() => router.push("/sign-in")}
          style={styles.cta}
        />
        <Button
          title={h.ctaSignUp}
          variant="secondary"
          onPress={() => router.push("/sign-up")}
        />
        <Txt
          variant="small"
          tone="accent"
          center
          onPress={() => router.push("/(tabs)/courses")}
          accessibilityRole="link"
          style={styles.browse}
        >
          {h.browse}
        </Txt>
      </View>

      <Footer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    marginTop: 34,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  heroSub: {
    color: palette.muted,
    maxWidth: 300,
    marginTop: 2,
  },
  actions: {
    marginTop: 30,
    gap: 12,
    alignSelf: "stretch",
    paddingHorizontal: 6,
  },
  cta: { alignSelf: "stretch" },
  browse: { marginTop: 10, paddingVertical: 8 },
});
