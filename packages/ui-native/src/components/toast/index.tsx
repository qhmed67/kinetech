import React from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { color, font, radius, spacing } from "@kinetech/tokens";

export interface ToastProps {
  visible: boolean;
  message: string;
  onClose?: () => void;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export function Toast({
  visible,
  message,
  onClose,
  duration = 3000,
  style,
}: ToastProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            onClose?.();
          });
        }, duration);
      });
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        { opacity },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.text, { color: color.bg }]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: spacing.gapLg,
    left: spacing.gapMd,
    right: spacing.gapMd,
    backgroundColor: color.bg,
    borderRadius: radius.panel,
    paddingHorizontal: spacing.gapLg,
    paddingVertical: spacing.space3,
    alignSelf: "center",
    maxWidth: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  text: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightBody,
    fontSize: 14,
    flex: 1,
  },
});
