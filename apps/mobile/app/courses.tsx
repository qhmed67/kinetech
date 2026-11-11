/* Web Courses page port (apps/web/src/pages/Courses.tsx): eyebrow + h1 with
 * page arrows, search pill, filter chips (all/bac/tech/other), 2-col card
 * grid (photo, bac badge, designation, name, duration · level, CTA +
 * details), pagination dots, expanded card modal. */

import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import { useLang } from "../src/lang";
import { listCourses, type CourseView } from "../src/lib/db/catalog";
import { ktFont, palette } from "../src/theme";
import { Eyebrow } from "../src/components/web/bits";
import { CourseModal } from "../src/components/web/CourseCard";
import { Footer } from "../src/components/web/Footer";
import { TopBar } from "../src/components/web/TopBar";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";
const PAGE_SIZE = 16;

function Chev({ next, color }: { next?: boolean; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      {next ? (
        <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}

export default function CoursesPage() {
  const { t, lang } = useLang();
  const c = t.catalog;
  const [all, setAll] = useState<CourseView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<CourseView | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    // Catalog fetches the max page worth; client filters/paginates like web.
    listCourses(lang, { limit: 100 })
      .then((rows) => {
        if (alive) setAll(rows);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  const filters = [
    { key: "all", label: c.filterAll },
    { key: "bac", label: c.catBac },
    { key: "tech", label: c.catProg },
    { key: "other", label: c.catOther },
  ];

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (all ?? [])
      .filter((course) => {
        if (filter === "bac" && !course.bac) return false;
        if (filter !== "all" && filter !== "bac" && course.cat !== filter) return false;
        if (
          needle &&
          !(course.name + " " + course.designation + " " + course.quote)
            .toLowerCase()
            .includes(needle)
        )
          return false;
        return true;
      });
  }, [all, filter, q]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goPage = (p: number) => {
    setPage(Math.min(pages, Math.max(1, p)));
    setActive(null);
  };

  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headRow}>
          <View style={{ flexShrink: 1 }}>
            <Eyebrow>{c.eyebrow}</Eyebrow>
            <Txt variant="h2">{c.h2}</Txt>
          </View>
          <View style={styles.arrows}>
            <Pressable
              onPress={() => goPage(safePage - 1)}
              disabled={safePage <= 1}
              style={[styles.arrowBtn, safePage <= 1 && styles.dim]}
              accessibilityLabel={lang === "ar" ? "السابق" : "Previous courses"}
            >
              <Chev color={palette.fg} />
            </Pressable>
            <Pressable
              onPress={() => goPage(safePage + 1)}
              disabled={safePage >= pages}
              style={[styles.arrowBtn, safePage >= pages && styles.dim]}
              accessibilityLabel={lang === "ar" ? "التالي" : "Next courses"}
            >
              <Chev next color={palette.fg} />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            value={q}
            onChangeText={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder={c.searchPh}
            accessibilityLabel={c.searchPh}
            style={styles.search}
            placeholderTextColor="#9aa0aa"
          />
          <View style={styles.chipRow}>
            {filters.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
                style={[styles.chip, filter === f.key ? styles.chipOn : styles.chipOff]}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === f.key }}
              >
                <Txt variant="small" style={{ color: filter === f.key ? "#fff" : palette.muted, fontWeight: "700" }}>
                  {f.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        </View>

        {all === null && !failed ? (
          <View style={styles.grid}>
            <View style={styles.skeleton} />
            <View style={[styles.skeleton, { opacity: 0.6 }]} />
          </View>
        ) : failed ? (
          <Txt variant="body" tone="muted">
            {t.offline.banner}
          </Txt>
        ) : list.length === 0 ? (
          <Txt variant="body" tone="muted">
            {c.empty}
          </Txt>
        ) : (
          <>
            <View style={styles.grid}>
              {visible.map((course) => (
                <Pressable
                  key={course.slug}
                  onPress={() => setActive(course)}
                  style={styles.card}
                  accessibilityRole="button"
                  accessibilityLabel={course.name}
                >
                  <View style={styles.imgBox}>
                    {course.photoCard ? (
                      <Image source={{ uri: course.photoCard }} style={styles.img} resizeMode="cover" />
                    ) : (
                      <Txt style={styles.imgFallback}>{course.name}</Txt>
                    )}
                    {course.bac && (
                      <View style={styles.bacBadge}>
                        <Txt style={styles.bacBadgeText}>{c.catBac}</Txt>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <Txt style={styles.desig}>{course.designation}</Txt>
                    <Txt variant="h3">{course.name}</Txt>
                    <Txt variant="small" tone="muted" style={styles.metaLine}>
                      {course.duration} · {course.level}
                    </Txt>
                    <View style={styles.cardActions}>
                      <Button
                        title={course.cta || "Buy Now"}
                        variant="primary"
                        size="sm"
                        onPress={() => void Linking.openURL(WA).catch(() => {})}
                      />
                      <Pressable onPress={() => router.push(`/course/${course.slug}` as never)}>
                        <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
                          {c.details}
                        </Txt>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
            {pages > 1 && (
              <View style={styles.pagesRow}>
                {Array.from({ length: pages }, (_, p) => p + 1).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => goPage(p)}
                    style={[styles.pageBtn, p === safePage ? styles.pageOn : styles.pageOff]}
                    accessibilityLabel={`Page ${p}`}
                  >
                    <Txt variant="small" style={{ color: p === safePage ? "#fff" : palette.muted, fontWeight: "700" }}>
                      {p}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Footer />

      <CourseModal
        course={
          active
            ? {
                slug: active.slug,
                name: active.name,
                designation: active.designation,
                quote: active.quote,
                cta: active.cta || "Buy Now",
                photoCard: active.photoCard,
              }
            : null
        }
        onClose={() => setActive(null)}
        onDetails={(slug) => router.push(`/course/${slug}` as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  content: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 40,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  arrows: { flexDirection: "row", gap: 12 },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { opacity: 0.3 },
  searchRow: {
    marginTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  search: {
    minHeight: 44,
    flexBasis: 280,
    maxWidth: 320,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    paddingHorizontal: 20,
    fontSize: 15,
    fontFamily: ktFont(500),
    color: palette.fg,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  chipOn: { backgroundColor: palette.accent },
  chipOff: { backgroundColor: palette.surface },
  grid: {
    marginTop: 32,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
  },
  skeleton: {
    flexGrow: 1,
    flexBasis: "46%",
    height: 380,
    borderRadius: 22,
    backgroundColor: palette.surface,
  },
  card: {
    flexGrow: 1,
    flexBasis: "46%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden",
  },
  imgBox: {
    height: 200,
    backgroundColor: palette.surface,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  img: { width: "100%", height: "100%" },
  imgFallback: {
    color: palette.mid,
    fontSize: 15,
    fontWeight: "700",
  },
  bacBadge: {
    position: "absolute",
    left: 16,
    top: 16,
    borderRadius: 999,
    backgroundColor: palette.teal,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bacBadgeText: {
    color: palette.deep,
    fontSize: 11,
    fontWeight: "700",
  },
  cardBody: { padding: 24, gap: 8 },
  desig: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.32,
    textTransform: "uppercase",
    fontFamily: ktFont(700),
  },
  metaLine: { marginTop: 4 },
  cardActions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  },
  pagesRow: {
    marginTop: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pageBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pageOn: { backgroundColor: palette.accent },
  pageOff: { backgroundColor: palette.surface },
});
