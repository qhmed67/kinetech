import { color } from "@kinetech/tokens";

/** Mobile palette — every value traces to @kinetech/tokens (DESIGN.md).
 *  No new hues are introduced here. */
export const palette = {
  fg: color.ktBlack, // text
  bg: color.ktWhite, // background
  surface: color.ktOffwhite, // card/chip backgrounds
  line: color.ktLine, // hairline borders
  border: color.ktGray, // stronger borders
  white: color.ktWhite,

  // Brand
  accent: color.ktPurple,
  accentDark: color.ktPurpleDark,
  teal: color.ktTeal,

  // Text levels
  muted: color.ktPurpleDeep2,
  disabled: color.ktGray,
};

export const elevation = {
  card: {
    shadowColor: color.ktBlack,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1, // Android
  },
};
