export const palette = {
  // Primary colors
  fg: "#1a1a1a", // foreground text
  bg: "#ffffff", // background
  surface: "#f8f8f8", // card backgrounds
  line: "#e0e0e0", // borders, dividers
  
  // Brand colors
  accent: "#6E4E9C", // primary purple
  accentHover: "#5a3d82", // darker purple for hover
  accentLight: "#f3eefd", // light purple for backgrounds
  
  // Secondary colors
  teal: "#3BBCD9", // secondary teal
  tealHover: "#2ea3b8", // darker teal for hover
  tealLight: "#e6f7fa", // light teal for backgrounds
  
  // Status colors
  success: "#10b981", // green for success
  warning: "#f59e0b", // amber for warnings
  error: "#ef4444", // red for errors
  
  // Semantic colors
  muted: "#6b7280", // secondary text
  disabled: "#9ca3af", // disabled elements
  focus: "#a78bfa", // focus ring
  
  // Text levels
  textPrimary: "#111827", // primary text
  textSecondary: "#374151", // secondary text
  textTertiary: "#6b7280", // tertiary text
  
  // Shadows
  shadow: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  },
};

export const elevation = {
  card: {
    ...palette.shadow.md,
    backgroundColor: palette.surface,
  },
  button: {
    ...palette.shadow.sm,
    backgroundColor: palette.accent,
  },
};