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
  /** Web .btn-* classes: primary/secondary/ghost/light/outline-light/ink (auth pages' #232323). */
  variant?: "primary" | "secondary" | "ghost" | "light" | "outline-light" | "ink";
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
    light: {
      backgroundColor: color.bg,
      borderColor: color.bg,
    },
    "outline-light": {
      backgroundColor: "transparent",
      borderColor: "rgba(255,255,255,0.55)",
    },
    ink: {
      backgroundColor: "#232323",
      borderColor: "#232323",
    },
  };

  const textColor =
    variant === "primary" || variant === "light" || variant === "ink"
      ? color.bg
      : variant === "outline-light"
        ? color.bg
        : color.fg;
  // Web buttons use font-display: Valley Sans (latin) / Alexandria (arabic).
  const isAr = /[\u0600-\u06FF]/.test(title);
  // Bundled per-weight families (mobile app registers them): Valley Sans 700
  // for Latin, Alexandria 700 for Arabic — the web's --font-display at 700.
  const family = isAr ? "Alexandria 700" : "Valley Sans 700";
  const weight = "700" as const;
  const tracking = isAr ? 0 : -0.3;

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
          { color: textColor, fontFamily: family, fontWeight: weight, letterSpacing: tracking },
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
