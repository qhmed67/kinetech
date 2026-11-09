import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { color, font, radius } from "@kinetech/tokens";

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: TabItem[];
  style?: StyleProp<ViewStyle>;
}

export function Tabs({ value, onValueChange, tabs, style }: TabsProps) {
  const activeIndex = tabs.findIndex((t) => t.value === value);
  const activeLeft = activeIndex >= 0 ? activeIndex * (320 / tabs.length) : 0;

  return (
    <View style={[styles.container, style]}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.value}
          onPress={() => onValueChange(tab.value)}
          style={[
            styles.tab,
            value === tab.value ? styles.active : styles.inactive,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab.value }}
          accessibilityLabel={tab.label}
        >
          <Text style={[styles.tabText, value === tab.value ? styles.textActive : styles.textInactive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={[styles.underline, { left: activeLeft }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  tabText: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightBody,
    fontSize: 14,
    color: color.muted,
  },
  active: {
    backgroundColor: color.surface,
  },
  inactive: {},
  textActive: {
    color: color.accent,
  },
  textInactive: {
    color: color.muted,
  },
  underline: {
    position: "absolute",
    bottom: -1,
    left: 0,
    height: 2,
    width: 100,
    backgroundColor: color.accent,
    borderRadius: radius.badge,
  },
});
