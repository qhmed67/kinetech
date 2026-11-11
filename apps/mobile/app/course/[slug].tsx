import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Button, Pill } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import { useAuth } from "../../src/auth";
import {
  getCourseBySlug,
  type Course,
} from "../../src/lib/db/catalog";
import { getWatchState, type WatchRow } from "../../src/lib/db/watch";
import { palette } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Divider } from "../../src/components/Section";
import { Txt } from "../../src/components/Txt";
import { CourseCard } from "../../src/components/CourseCard";
import { EmptyState } from "../../src/components/States";

export default function CourseDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useLang();
  const { user, ready } = useAuth();
  const router = useRouter();
  const c = t.course;

  const [course, setCourse] = useState<Course | null>(null);
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const courseData = await getCourseBySlug(slug, lang);
      const watchData = await getWatchState(slug, lang);
      setCourse(courseData);
      setRows(watchData);
      setError(false);
    } catch {
      setCourse(null);
      setRows([]);
      setError(true);
    }
  }, [slug, lang]);

  useEffect(() => {
    setCourse(null);
    setRows(null);
    void load();
  }, [load]);

  const isEnrolled = Boolean(
    user && (user.role === "admin" || user.enrolled.includes(slug ?? "")),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.loading}>
          <View style={styles.spinner} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
          />
        }
      >
        <EmptyState
          title={lang === "ar" ? "تعذّر تحميل تفاصيل الكورس" : "Couldn't load course details"}
          note={
            lang === "ar"
              ? "تحقق من الاتصال وحاول مرة أخرى."
              : "Check your connection and try again."
          }
          actionLabel={t.watch.retryBtn}
          onAction={() => void load()}
          icon="cloud-offline-outline"
        />
      </Screen>
    );
  }

  if (!course) {
    return (
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
          />
        }
      >
        <EmptyState
          title={c.notFound}
          note={c.notFoundD}
          icon="book-outline"
        />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.accent}
        />
      }
    >
      <View style={styles.head}>
        <Txt variant="h2">{course.name}</Txt>
        <Txt variant="small" style={styles.sub}>
          {course.designation}
        </Txt>
        <View style={styles.meta}>
          <Pill
            label={course.isBac ? c.catBac : course.cat === "tech" ? c.catProg : c.catOther}
            tone={course.isBac ? "accent" : "soft"}
          />
          <Txt variant="meta" style={styles.muted}>
            {c.parts}: {rows?.length || 0}
          </Txt>
        </View>
      </View>

      <View style={styles.section}>
        <Txt variant="title">{c.aboutT}</Txt>
        <Txt variant="small" style={styles.desc}>
          {course.description}
        </Txt>
      </View>

      <View style={styles.section}>
        <Txt variant="title">{c.contentT}</Txt>
        {rows === null ? (
          <View style={styles.loading}>
            <View style={styles.spinner} />
          </View>
        ) : rows.length === 0 ? (
          <Txt variant="small" style={styles.muted}>
            {c.emptyParts}
          </Txt>
        ) : (
          <View style={styles.parts}>
            {rows.map((row, i) => {
              const unlocked = row.unlocked;
              const done = row.done;
              return (
                <View key={row.video_id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.partRow}>
                    <View style={styles.partNum}>
                      <Txt
                        variant="meta"
                        style={styles.partNumText}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </Txt>
                    </View>
                    <View style={styles.flex}>
                      <Txt variant="small" style={styles.partTitle}>
                        {row.title}
                      </Txt>
                      <Txt variant="meta" style={styles.partMeta}>
                        {row.mins} {c.min}
                        {done ? ` · ${t.dashboard.doneLessons}` : ` · ${row.views_count}/3`}
                      </Txt>
                    </View>
                    <Ionicons
                      name={
                        done
                          ? "checkmark-circle"
                          : unlocked
                            ? "play-circle-outline"
                            : "lock-closed-outline"
                      }
                      size={20}
                      color={
                        done
                          ? palette.teal
                          : unlocked
                            ? palette.accent
                            : palette.border
                      }
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {!isEnrolled && (
        <View style={styles.enroll}>
          <Button
            title={c.enrollBtn}
            onPress={() => {
              // TODO: Implement enrollment flow
              router.push("/(tabs)/courses");
            }}
          />
        </View>
      )}

      {isEnrolled && rows && rows.length > 0 && (
        <View style={styles.watch}>
          <Button
            title={c.watchBtn}
            onPress={() => {
              const firstUnlocked = rows.find(r => r.unlocked);
              const firstVideo = firstUnlocked ? firstUnlocked.sort_order : 0;
              router.push(`/watch/${slug}/${firstVideo}`);
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: 40, alignItems: "center" },
  spinner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.accent,
    borderTopColor: "transparent",
  },
  head: { marginTop: 22, gap: 8 },
  sub: { color: palette.muted },
  meta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  muted: { color: palette.muted },
  section: { paddingTop: 18, gap: 10 },
  desc: { color: palette.fg, lineHeight: 20 },
  parts: { marginTop: 8 },
  partRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  partNum: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  partNumText: { fontSize: 11, color: palette.muted },
  partTitle: { color: palette.fg },
  partMeta: { fontSize: 11, marginTop: 3 },
  flex: { flex: 1 },
  enroll: { marginTop: 20 },
  watch: { marginTop: 16, marginBottom: 20 },
});