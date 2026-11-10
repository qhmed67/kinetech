import { StyleSheet, Text, TextProps } from "react-native";
import { palette } from "../theme";

type Variant = "h1" | "h2" | "h3" | "h4" | "title" | "small" | "meta";
type Tone = "default" | "accent" | "muted" | "teal" | "white";

interface TxtProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

const variantStyles: Record<Variant, any> = {
  h1: {
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  h4: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
  },
};

export function Txt({ variant = "small", tone = "default", center, style, ...props }: TxtProps) {
  const color = {
    default: palette.fg,
    accent: palette.accent,
    muted: palette.muted,
    teal: palette.teal,
    white: palette.white,
  }[tone];

  const textStyle = [
    variantStyles[variant],
    { color },
    center && { textAlign: "center" },
    style,
  ];

  return <Text style={textStyle} {...props} />;
}