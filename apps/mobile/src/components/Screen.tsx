import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette } from "../theme";

interface ScreenProps {
  children: React.ReactNode;
  refreshControl?: React.ReactNode;
  style?: any;
}

export function Screen({ children, refreshControl, style }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safeArea, style]}>
      <View style={[styles.container, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  container: {
    flex: 1,
    backgroundColor: palette.surface,
  },
});