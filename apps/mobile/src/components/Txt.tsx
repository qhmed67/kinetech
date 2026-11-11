import { StyleSheet, Text, TextProps, type TextStyle } from "react-native";
import { ktFont, palette } from "../theme";

/* Web type scale (index.css): h1 clamp(44-78), h2 clamp(30-46), body 16.
   Phone sizes pick the low end of the clamps so copy reads identically. */

type Variant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "title"
  | "lead"
  | "body"
  | "small"
  | "meta";
type Tone = "default" | "accent" | "muted" | "teal" | "white" | "deep";

interface TxtProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
  /** Force the accent script font (Pacifico) — hero script line. */
  script?: boolean;
}

const variantStyles: Record<Variant, TextStyle> = {
  h1: {
    fontSize: 44,
    fontWeight: "700",
    lineHeight: 52,
    letterSpacing: -0.9, // -.02em at 44px
  },
  h2: {
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  h3: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  h4: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  lead: {
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 26,
  },
  body: {
    fontSize: 15.5,
    fontWeight: "500",
    lineHeight: 23, // 1.55
  },
  small: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 21,
  },
  meta: {
    fontSize: 12.5,
    fontWeight: "500",
    lineHeight: 17,
  },
};

const tones: Record<Tone, string> = {
  default: palette.fg,
  accent: palette.accent,
  muted: palette.muted,
  teal: palette.teal,
  white: palette.white,
  deep: palette.deep,
};

const ARABIC = /[\u0600-\u06FF\u0750-\u077F]/;

function firstString(children: unknown): string {
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    if (typeof c === "string") return c;
    if (c && typeof c === "object" && "props" in (c as object)) {
      const s = firstString((c as { props?: { children?: unknown } }).props?.children);
      if (s) return s;
    }
  }
  return "";
}

export function Txt({
  variant = "body",
  tone = "default",
  center,
  script,
  children,
  style,
  ...props
}: TxtProps) {
  const text = firstString(children);
  const isAr = ARABIC.test(text);
  const weight = typeof variantStyles[variant].fontWeight === "number"
    ? (variantStyles[variant].fontWeight as number)
    : 500;
  const family = script
    ? { fontFamily: "Pacifico" }
    : { fontFamily: ktFont(weight, isAr) };
  // Letter tracking reads wrong on Arabic script — web zeroes it via font choice.
  const tracking = isAr ? { letterSpacing: 0 } : null;

  const textStyle = [
    variantStyles[variant],
    { color: tones[tone] },
    family,
    tracking,
    center && styles.center,
    style,
  ];

  return (
    <Text style={textStyle} {...props}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
});
