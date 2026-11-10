import { StyleSheet, View } from "react-native";
import { palette } from "../theme";

interface SectionProps {
  children: React.ReactNode;
  style?: any;
}

export function Section({ children, style }: SectionProps) {
  return (
    <View style={[styles.section, style]}>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  divider: {
    height: 1,
    backgroundColor: palette.line,
    marginVertical: 16,
  },
});