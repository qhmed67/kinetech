import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Input } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import {
  listCourses,
  type CatalogFilter,
  type CourseCard as Course,
} from "../../src/lib/db/catalog";
import { palette } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { SectionHeader } from "../../src/components/Section";
import { Txt } from "../../src/components/Txt";
import { CourseCard } from "../../src/components/CourseCard";
import { CardSkeletons, EmptyState } from "../../src/components/States";
import { Footer } from "../../src/components/Footer";

const PAGE_SIZE = 12;

export default function Courses() {
  const { t, lang } = useLang();
  const router = useRouter();
  const c = t.catalog;

  const [all, setAll] = useState<Course[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const rows = await listCourses(lang, { limit: 60 });
      setAll(rows);
      setError(false);
    } catch {
      setAll([]);
      setError(true);
    }
  }, [lang]);

  useEffect(() => {
    setAll(null);
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filters: Array<{ key: CatalogFilter; label: string }> = [
    { key: "all", label: c.filterAll },
    { key: "bac", label: c.catBac },
    { key: "tech", label: c.catProg },
    { key: "other", label: c.catOther },
  ];

  const list = useMemo(() => {
    const rows = all ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((course) => {
      if (filter === "bac" && !course.isBac) return false;
      if (filter !== "all" && filter !== "bac" && course.cat !== filter)
        return false;
      if (
        needle &&
        !`${course.name} ${course.designation}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    });
  }, [all, filter, q]);

  const visible = list.slice(0, page * PAGE_SIZE);
  const canLoadMore = visible.length < list.length;

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
        <SectionHeader eyebrow={c.eyebrow} title={c.h2} />
      </View>

      <Input
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setPage(1);
        }}
        placeholder={c.searchPh}
        textAlign={lang === "ar" ? "right" : "left"}
        style={styles.search}
      />

      <View style={styles.chips}>
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <Txt
              key={f.key}
              variant="meta"
              onPress={() => {
                setFilter(f.key);
                setPage(1);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive, active && styles.chipActiveText]}
            >
              {f.label}
            </Txt>
          );
        })}
      </View>

      {all === null ? (
        <CardSkeletons count={4} />
      ) : error ? (
        <EmptyState
          title={lang === "ar" ? "تعذّر تحميل الكورسات" : "Couldn't load courses"}
          note={
            lang === "ar"
              ? "تحقق من الاتصال وحاول مرة أخرى."
              : "Check your connection and try again."
          }
          actionLabel={t.watch.retryBtn}
          onAction={() => void load()}
          icon="cloud-offline-outline"
        />
      ) : list.length === 0 ? (
        <EmptyState title={c.empty} icon="search-outline" />
      ) : (
        <>
          <View style={styles.grid}>
            {visible.map((course) => (
              <View key={course.slug} style={styles.gridItem}>
                <CourseCard
                  course={course}
                  compact
                  onPress={() => router.push(`/course/${course.slug}`)}
                />
              </View>
            ))}
          </View>
          {canLoadMore ? (
            <Txt
              variant="small"
              tone="accent"
              center
              onPress={() => setPage((p) => p + 1)}
              style={styles.more}
            >
              {lang === "ar" ? "عرض المزيد" : "Show more"}
            </Txt>
          ) : null}
        </>
      )}

      <Footer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: 22, marginBottom: 16 },
  search: { marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    backgroundColor: palette.surface,
    color: palette.muted,
    paddingHorizontal: 15,
    paddingVertical: 9,
    overflow: "hidden",
    fontSize: 12.5,
  },
  chipActive: { backgroundColor: palette.accent },
  chipActiveText: { color: palette.white },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
  },
  gridItem: { width: "48.2%" },
  more: { marginTop: 22, paddingVertical: 10 },
});
