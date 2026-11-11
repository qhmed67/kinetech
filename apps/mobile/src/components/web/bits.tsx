/* Web bits port (apps/web/src/components/bits.tsx + index.css brand classes):
 * Eyebrow, Pill, BadgeDot, BadgePurple, CheckRow, DotGrid, and the web's
 * inline SVG icons rendered 1:1 with react-native-svg. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { palette } from "../../theme";
import { Txt } from "../Txt";

/* ---------------- icons (web SVG paths, verbatim) ---------------- */

export function CheckIcon({ size = 16, color = palette.white, strokeWidth = 2.4 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5 9.5 18 20 6.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LockIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="11" width="14" height="9" rx="2" stroke={color} strokeWidth="2" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function CheckHeavyIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5 9.5 18 20 6.5" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ---------------- brand pieces ---------------- */

/** .eyebrow — uppercase accent kicker. */
export function Eyebrow({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.eyebrowWrap, style]}>
      <Txt variant="meta" style={styles.eyebrow}>
        {children}
      </Txt>
    </View>
  );
}

/** .pill — teal badge kicker. */
export function Pill({ children, ghost, style }: { children: string; ghost?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, ghost && styles.pillGhost, style]}>
      <Txt variant="meta" style={[styles.pillText, ghost && { color: palette.deep }]}>
        {children}
      </Txt>
    </View>
  );
}

/** .badge-dot — 32px teal circle with a check. */
export function BadgeDot({ accent, style }: { accent?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badgeDot, accent && { backgroundColor: palette.accent }, style]}>
      <CheckIcon size={16} />
    </View>
  );
}

/** .badge-purple — 44px accent circle with a check. */
export function BadgePurple({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badgePurple, style]}>
      <CheckIcon size={20} />
    </View>
  );
}

/** .checkrow — badge-dot + bold line. */
export function CheckRow({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <View style={styles.checkRow}>
      <BadgeDot />
      <Txt variant="body" style={[styles.checkText, dark && { color: palette.white }]}>
        {children}
      </Txt>
    </View>
  );
}

/** .dotgrid — 8-col dot texture (pillar-big corner). */
export function DotGrid({ style, cols = 8, rows = 2, color = palette.mid }: { style?: StyleProp<ViewStyle>; cols?: number; rows?: number; color?: string }) {
  return (
    <View style={[styles.dotGrid, style]} pointerEvents="none">
      {Array.from({ length: cols * rows }).map((_, i) => (
        <View key={i} style={[styles.dotGridDot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/** Chat bubble art (Pillars SVG, verbatim paths). */
export function ChatArt({ size = 120, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Rect x="10" y="18" width="100" height="64" rx="16" fill={color} opacity={0.16} />
      <Rect x="24" y="34" width="52" height="8" rx="4" fill={color} />
      <Rect x="24" y="48" width="72" height="7" rx="3.5" fill={color} opacity={0.55} />
      <Rect x="24" y="60" width="60" height="7" rx="3.5" fill={color} opacity={0.55} />
      <Path d="M34 82l-6 16 20-16z" fill={color} opacity={0.16} />
      <Circle cx="94" cy="34" r="10" fill={color} opacity={0.35} />
    </Svg>
  );
}

export function ScopeArt({ size = 120, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Circle cx="60" cy="60" r="44" stroke={color} strokeWidth="9" opacity={0.2} />
      <Circle cx="60" cy="60" r="26" stroke={color} strokeWidth="9" opacity={0.45} />
      <Circle cx="60" cy="60" r="9" fill={color} />
      <Path d="M92 30l14-14M106 30l-14-14" stroke={color} strokeWidth="6" strokeLinecap="round" opacity={0.6} />
    </Svg>
  );
}

/** Services motif strokes (web Motif paths). */
export function Motif({ index, size = 24, color }: { index: number; size?: number; color: string }) {
  const path = index % 4;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {path === 0 && (
        <G>
          <Path d="M22 7l-8.5 8.5-5-5L2 17" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M16 7h6v6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {path === 1 && (
        <Path d="M9 9l-5 3 5 3M15 9l5 3-5 3M13 5l-2 14" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {path === 2 && (
        <G>
          <Path d="M4 20l1.2-4.2L16 5l3 3L8.2 18.8 4 20z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M14.5 6.5l3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {path === 3 && (
        <G>
          <Path d="M12 4L2 9.5 12 15l8-3.4v5.9h2V9.5L12 4z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M6.5 12.5V17c0 2.5 2.5 4.5 5.5 4.5s5.5-2 5.5-4.5v-4.5L12 15l-5.5-2.5z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
    </Svg>
  );
}

/** Chevron for carousels (web Chev). */
export function Chev({ next, size = 24, color }: { next?: boolean; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {next ? (
        <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  eyebrowWrap: { marginBottom: 14 },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2, // .1em
    textTransform: "uppercase",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.teal,
    alignSelf: "flex-start",
  },
  pillGhost: {
    backgroundColor: "rgba(59,188,217,0.16)",
    borderWidth: 1,
    borderColor: "rgba(59,188,217,0.45)",
  },
  pillText: {
    color: palette.deep,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.72,
    textTransform: "uppercase",
  },
  badgeDot: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badgePurple: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkText: { fontWeight: "700", flexShrink: 1 },
  dotGrid: {
    position: "absolute",
    left: 24,
    top: 22,
    flexDirection: "row",
    flexWrap: "wrap",
    width: 8 * 14, // 8 cols * (6px + 8px gap)
    opacity: 0.5,
  },
  dotGridDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
});
