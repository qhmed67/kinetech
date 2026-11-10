import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { color, radius } from "@kinetech/tokens";

export interface SkeletonProps {
  width?: number;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = 100,
  height = 16,
  borderRadius = radius.panel,
  style,
}: SkeletonProps) {
  const opacity = new Animated.Value(1);

  Animated.loop(
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 1200, useNativeDriver: true }),
    ])
  ).start();

  return (
    <View
      style={[
        styles.container,
        style,
        { width, height, borderRadius },
      ]}
    >
      <Animated.View
        style={[
          styles.overlay,
          { backgroundColor: color.surface, opacity },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: color.surface,
    borderRadius: radius.panel,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.surface,
  },
});
