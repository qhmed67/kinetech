import { StyleSheet, Text, View } from "react-native";
import { color } from "@kinetech/tokens";

export default function Home() {
  return (
    <View style={[styles.c, { backgroundColor: color.bg }]}>
      <Text style={[styles.t, { color: color.fg }]}>Home</Text>
    </View>
  );
}
const styles = StyleSheet.create({ c: { flex: 1, alignItems: "center", justifyContent: "center" }, t: { fontSize: 20 } });
