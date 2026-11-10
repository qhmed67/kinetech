import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../src/theme";
import { Screen } from "../src/components/Screen";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

export default function NotFound() {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.icon}>
          <Ionicons
            name="help-circle-outline"
            size={80}
            color={palette.accent}
          />
        </View>
        <Txt variant="h1">404 - Page Not Found</Txt>
        <Txt variant="small" style={styles.text}>
          The page you're looking for doesn't exist or has been moved.
        </Txt>
        <Button
          title="Go Home"
          onPress={() => {
            // TODO: Navigate to home screen
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  icon: {
    marginBottom: 24,
  },
  text: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
});