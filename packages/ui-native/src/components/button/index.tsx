import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { color, font, radius } from "@kinetech/tokens";

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  size = "md",
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const variants: Record<string, any> = {
    primary: {
      backgroundColor: color.accent,
      borderColor: color.accent,
    },
    secondary: {
      backgroundColor: "transparent",
      borderColor: color.border,
    },
    ghost: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
  };

  const textColor = variant === "primary" ? color.bg : color.fg;

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      style={[
        styles.container,
        variants[variant],
        size === "sm" && styles.small,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: loading }}
    >
      <Text
        style={[
          styles.text,
          { color: textColor },
          size === "sm" && styles.smallText,
          textStyle,
        ]}
      >
        {loading ? "…" : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.badge,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 22,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  small: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  text: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightDisplay,
    fontSize: 15,
  },
  smallText: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
});
