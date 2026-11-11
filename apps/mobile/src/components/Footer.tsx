import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { palette } from "../theme";
import { Txt } from "./Txt";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

export function Footer() {
  const navigation = useNavigation();

  const tabs: Array<{ icon: IonName; label: string; route: string }> = [
    {
      icon: "home-outline",
      label: "Home",
      route: "/(tabs)/index",
    },
    {
      icon: "book-outline",
      label: "Courses",
      route: "/(tabs)/courses",
    },
    {
      icon: "person-outline",
      label: "Profile",
      route: "/(tabs)/profile",
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {tabs.map((tab) => (
          <View key={tab.label} style={styles.tab}>
            <Ionicons
              name={tab.icon}
              size={20}
              color={palette.accent}
            />
            <Txt variant="meta" style={styles.label}>
              {tab.label}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingVertical: 8,
  },
  content: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  tab: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
  },
  label: {
    color: palette.muted,
  },
});