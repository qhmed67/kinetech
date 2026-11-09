// KineTech design tokens — single source for web (tokens.css) and mobile (these objects).
// Every color traces to DESIGN.md (colors, gradients, radii, type) or the web's actual
// rendered value where DESIGN.md and the web disagreed at Phase 2 time (see
// docs/mobile/CONFLICTS.md §8). No new hues; missing states derived by opacity/lightness.

export const color = {
  bg: "#FFFFFF",
  surface: "#ECEAEF",
  fg: "#1A1A1A",
  muted: "#3D3250",
  border: "#A8A8A8",
  accent: "#6E4E9C",
  ktMid: "#7F639E",
  ktDark: "#3A1E6B",
  ktDeep: "#3D3250",
  ktTeal: "#3BBCD9",
  ktTint: "#927BB3",
  ktShade: "#472885",
  ktShade2: "#502D93",
  ktLine: "#ECEAEF",
  // DESIGN.md canonical aliases (same resolved values)
  ktPurple: "#6E4E9C",
  ktPurpleMid: "#7F639E",
  ktPurpleDark: "#3A1E6B",
  ktPurpleDeep2: "#3D3250",
  ktGray: "#A8A8A8",
  ktWhite: "#FFFFFF",
  ktOffwhite: "#ECEAEF",
  ktBlack: "#1A1A1A",
} as const;

export const gradient = {
  kt: "linear-gradient(135deg, #927BB3 0%, #7F639E 35%, #6E4E9C 60%, #472885 85%, #3A1E6B 100%)",
  ktDark: "linear-gradient(135deg, #502D93 0%, #472885 40%, #3A1E6B 78%, #3D3250 100%)",
} as const;

export const radius = {
  panel: 32,
  badge: 999,
} as const;

export const spacing = {
  // Web-actual gaps (CONFLICTS §8: differ from DESIGN.md 8/16/24/40/64; web kept)
  gapMd: 20,
  gapLg: 32,
  gapXl: 56,
  gap2xl: 96,
  gutter: 32,
  container: 1160,
  // DESIGN.md scale (for mobile decisions; web keeps its gaps above)
  space1: 8,
  space2: 16,
  space3: 24,
  space4: 40,
  space5: 64,
} as const;

export const font = {
  // Web-actual stacks (CONFLICTS §8: include Valley Sans first; DESIGN.md is Alexandria-only)
  display: '"Valley Sans", "Alexandria", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  body: '"Valley Sans", "Alexandria", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  accent: '"Pacifico", "Lobster", cursive',
  mono: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace',
  // DESIGN.md intended families (mobile to follow owner decision on the CONFLICTS difference)
  displayDesign: '"Alexandria", sans-serif',
  bodyDesign: '"Alexandria", sans-serif',
  accentDesign: '"Pacifico", "Lobster", cursive',
  weightBody: 500,
  weightDisplay: 700,
  // Mobile font family names (single family, loaded via expo-font/Alexandria)
  displayMobile: "Alexandria",
  bodyMobile: "Alexandria",
  accentMobile: "Alexandria",
} as const;

export const fontSize = {
  h1: "clamp(44px, 6vw, 78px)",
  h2: "clamp(30px, 3.8vw, 46px)",
  body: 16,
  meta: 13,
} as const;
