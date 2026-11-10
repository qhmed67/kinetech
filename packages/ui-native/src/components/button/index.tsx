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
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  title,
  onPress,
  disabled = false,
  variant = "primary",
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
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[
        styles.container,
        variants[variant],
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={[styles.text, { color: textColor }, textStyle]}>
        {title}
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
  text: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightDisplay,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
