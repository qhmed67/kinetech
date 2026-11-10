import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../theme";
import { Txt } from "./Txt";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Txt variant="h2">{title}</Txt>
        {subtitle && (
          <Txt variant="small" style={styles.subtitle}>
            {subtitle}
          </Txt>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  content: {
    alignItems: "center",
    gap: 4,
  },
  subtitle: {
    color: palette.muted,
  },
});