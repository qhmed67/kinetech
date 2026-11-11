/* Web NotFound port (apps/web/src/pages/NotFound.tsx): gradient "?" medallion,
 * heading, lead, primary "back home" button. */

import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useLang } from "../src/lang";
import { ktGradient, palette } from "../src/theme";
import { Footer } from "../src/components/web/Footer";
import { TopBar } from "../src/components/web/TopBar";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

export default function NotFoundScreen() {
  const { t } = useLang();
  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 0 }}>
        <View style={styles.wrap}>
          <LinearGradient
            colors={ktGradient as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.medallion}
          >
            <Txt style={styles.mark}>?</Txt>
          </LinearGradient>
          <Txt variant="h2" style={{ marginTop: 24, textAlign: "center" }}>
            {t.misc.notfoundT}
          </Txt>
          <Txt variant="lead" style={styles.lead}>
            {t.misc.notfoundD}
          </Txt>
          <Button
            title={t.misc.home}
            variant="primary"
            onPress={() => router.replace("/" as never)}
            style={{ marginTop: 24, alignSelf: "center", paddingHorizontal: 32 }}
          />
        </View>

        <Footer />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  wrap: {
    paddingVertical: 72,
    paddingHorizontal: 16,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },
  medallion: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "700",
    fontFamily: "Valley Sans 700",
  },
  lead: {
    marginTop: 12,
    textAlign: "center",
  },
});
