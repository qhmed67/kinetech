import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../theme";
import { Txt } from "./Txt";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

interface EmptyStateProps {
  title: string;
  note?: string;
  icon?: IonName;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ 
  title, 
  note, 
  icon = "document-text-outline", 
  actionLabel, 
  onAction,
  style 
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={48} color={palette.muted} />
      </View>
      <Txt variant="h2" style={styles.title}>
        {title}
      </Txt>
      {note && (
        <Txt variant="small" style={styles.note}>
          {note}
        </Txt>
      )}
      {actionLabel && onAction && (
        <View style={styles.action}>
          <Txt 
            variant="meta" 
            tone="accent"
            onPress={onAction}
            style={styles.actionText}
          >
            {actionLabel}
          </Txt>
        </View>
      )}
    </View>
  );
}

interface CardSkeletonsProps {
  count?: number;
}

export function CardSkeletons({ count = 4 }: CardSkeletonsProps) {
  return (
    <View style={styles.skeletons}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.skeleton}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonContent}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  note: {
    textAlign: "center",
    lineHeight: 22,
    color: palette.muted,
  },
  action: {
    marginTop: 16,
  },
  actionText: {
    textDecorationLine: "underline",
  },
  skeletons: {
    gap: 16,
  },
  skeleton: {
    flexDirection: "row",
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 16,
  },
  skeletonImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: palette.bg,
  },
  skeletonContent: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.bg,
  },
  skeletonLineShort: {
    width: "60%",
  },
});