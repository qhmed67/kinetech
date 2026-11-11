/* Web landing port (apps/web/src/App.tsx route "#/"): TopNav + Hero +
 * Pillars + Services + Academy + Reviews + Contact + Footer, same order. */

import { ScrollView, StyleSheet, View } from "react-native";
import { TopBar } from "../src/components/web/TopBar";
import { Hero } from "../src/components/web/Hero";
import { Pillars } from "../src/components/web/Pillars";
import { Services } from "../src/components/web/Services";
import { Academy } from "../src/components/web/Academy";
import { Reviews } from "../src/components/web/Reviews";
import { Contact } from "../src/components/web/Contact";
import { Footer } from "../src/components/web/Footer";

export default function Landing() {
  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero />
        <Pillars />
        <Services />
        <Academy />
        <Reviews />
        <Contact />
        <Footer />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { paddingBottom: 0 },
});
