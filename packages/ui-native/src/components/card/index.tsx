import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, spacing } from "@kinetech/tokens";

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.panel,
    padding: spacing.gapMd,
  },
});
