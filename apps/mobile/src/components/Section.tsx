import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { color } from "@kinetech/tokens";
import { Txt } from "./Txt";

interface SectionProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Section({ children, style }: SectionProps) {
  return <View style={[styles.section, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function SectionHeader({
  eyebrow,
  title,
  style,
}: {
  eyebrow: string;
  title: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.header, style]}>
      <Txt variant="meta" tone="accent">
        {eyebrow}
      </Txt>
      <Txt variant="h2">{title}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
  },
  header: {
    gap: 4,
  },
});
