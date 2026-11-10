import { Image, StyleSheet, View } from "react-native";
import { Pressable } from "react-native";
import { palette } from "../theme";
import { Txt } from "./Txt";

interface CourseCardProps {
  course: {
    slug: string;
    name: string;
    designation: string;
    image?: string;
    isBac?: boolean;
    cat: "tech" | "other" | "bac";
  };
  progress?: {
    done: number;
    total: number;
  };
  compact?: boolean;
  onPress?: () => void;
}

export function CourseCard({ course, progress, compact = false, onPress }: CourseCardProps) {
  const imageUrl = course.image || `https://via.placeholder.com/300x200/6E4E9C/FFFFFF?text=${course.name}`;

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        style={styles.compactCard}
      >
        <View style={styles.compactContent}>
          <View style={styles.compactImage}>
            <Image source={{ uri: imageUrl }} style={styles.compactImageStyle} />
          </View>
          <View style={styles.compactText}>
            <Txt variant="h3" numberOfLines={2}>{course.name}</Txt>
            <Txt variant="meta" style={styles.compactMeta}>
              {progress ? `${progress.done}/${progress.total} parts` : course.designation}
            </Txt>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUrl }} style={styles.image} />
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Txt variant="h3" numberOfLines={2}>{course.name}</Txt>
          <View style={styles.category}>
            <Txt variant="meta" style={styles.categoryText}>
              {course.isBac ? "Baccalaureate" : course.cat === "tech" ? "Technology" : "Other"}
            </Txt>
          </View>
        </View>
        <Txt variant="small" style={styles.designation}>
          {course.designation}
        </Txt>
        {progress && (
          <View style={styles.progress}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  },
                ]}
              />
            </View>
            <Txt variant="meta" style={styles.progressText}>
              {progress.done}/{progress.total} parts
            </Txt>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    marginBottom: 16,
  },
  compactCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
    marginBottom: 16,
  },
  imageContainer: {
    width: 120,
    height: 120,
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  compactImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
  },
  compactImageStyle: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 8,
  },
  compactContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  compactText: {
    flex: 1,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  designation: {
    color: palette.muted,
    fontSize: 14,
  },
  category: {
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    color: palette.white,
    fontSize: 11,
    fontWeight: "600",
  },
  progress: {
    marginTop: 8,
    gap: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: palette.accent,
    borderRadius: 3,
  },
  progressText: {
    color: palette.muted,
    fontSize: 12,
  },
  compactMeta: {
    color: palette.muted,
    fontSize: 12,
  },
});