import { color, radius as tkRadius, font as tkFont } from "@kinetech/tokens";

/** Mobile palette — mirrors packages/tokens (web :root) 1:1.
 *  Functional accent colors (#25D366 WhatsApp, #B3261E error, warning chips)
 *  are the web's rendered values (apps/web/src/index.css / pages) — carried
 *  over so the app matches the site exactly. */
export const palette = {
  // Web :root tokens
  fg: color.ktBlack,
  bg: color.ktWhite,
  surface: color.ktOffwhite,
  muted: color.ktPurpleDeep2,
  border: color.ktGray,
  line: color.ktLine,
  white: color.ktWhite,
  black: color.ktBlack,

  // Brand
  accent: color.ktPurple,
  mid: color.ktPurpleMid,
  dark: color.ktPurpleDark,
  deep: color.ktPurpleDeep2,
  teal: color.ktTeal,
  tint: color.ktTint,
  shade: color.ktShade,
  shade2: color.ktShade2,

  // Web functional colors (same values as the site)
  wa: "#25D366",
  err: "#B3261E",
  warnBg: "#FEF3E2",
  warnFg: "#9A6B1B",
  warnSessionBg: "#FFF8E6",
  warnSessionFg: "#9A6B00",
  inkBtn: "#232323", // auth pages primary button
} as const;

/** --kt-gradient (135°, 5 stops) — matches web exactly. */
export const ktGradient = [
  palette.tint,
  palette.mid,
  palette.accent,
  palette.shade,
  palette.dark,
] as const;

/** --kt-dark-gradient (135°) — CTA blocks. */
export const ktDarkGradient = [
  palette.shade2,
  palette.shade,
  palette.dark,
  palette.deep,
] as const;

export const radii = {
  panel: tkRadius.panel ?? 32,
  badge: 999,
} as const;

export const fontFamily = {
  display: "Valley Sans",
  body: "Valley Sans",
  accent: "Pacifico",
  arabic: "Alexandria",
} as const;

/**
 * Bundled font families are registered per weight (RN synthesizes nothing
 * for custom fonts). Arabic → Alexandria (500/700), Latin → Valley Sans
 * (400/500/600/700) — same stack as the web's --font-display/body.
 */
export function ktFont(
  weight: number | "normal" | "bold" = 500,
  isArabic = false,
): string {
  if (isArabic) return weight === "bold" || weight === "normal" ? (weight === "bold" ? "Alexandria 700" : "Alexandria") : weight >= 700 ? "Alexandria 700" : "Alexandria";
  const w: number = weight === "bold" ? 700 : weight === "normal" ? 400 : weight;
  const tier = w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400;
  return `Valley Sans ${tier}`;
}

export const fontDisplay = tkFont.weightDisplay; // 700

export const elevation = {
  card: {
    shadowColor: palette.black,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  float: {
    shadowColor: palette.black,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  phone: {
    shadowColor: palette.deep,
    shadowOpacity: 0.55,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 28 },
    elevation: 12,
  },
} as const;
