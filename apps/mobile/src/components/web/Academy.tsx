/* Web Academy port (apps/web/src/components/Academy.tsx): eyebrow + h2,
 * horizontal course rail (82vw cards, snap), thumb arrows below, expanded
 * card modal. Data: same listCourses the web store hydrates (catalog db). */

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewInstance } from "react-native";
import { useLang } from "../../lang";
import { listCourses, type CourseView } from "../../lib/db/catalog";
import { palette } from "../../theme";
import { Eyebrow } from "./bits";
import { Chev } from "./bits";
import { CourseCard, CourseModal, WA, type CourseCardData } from "./CourseCard";
import { Txt } from "../Txt";

export function Academy() {
  const { t, lang } = useLang();
  const a = t.academy;
  const [courses, setCourses] = useState<CourseView[] | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState<CourseCardData | null>(null);
  const railRef = useRef<ScrollViewInstance>(null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let alive = true;
    setError(false);
    listCourses(lang, { limit: 8 })
      .then((rows) => {
        if (alive) setCourses(rows);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  const cards: CourseCardData[] = useMemo(
    () =>
      (courses ?? []).map((c) => ({
        slug: c.slug,
        name: c.name,
        designation: c.designation,
        quote: c.quote,
        cta: c.cta || t.academy.ctas[0] || "Buy Now",
        photoCard: c.photoCard,
      })),
    [courses, t],
  );

  const railX = useRef(0);
  const scrollBy = (dir: 1 | -1) => {
    const step = Math.min(width * 0.8, 340) + 16;
    const next = Math.max(0, railX.current + dir * step);
    railRef.current?.scrollTo({ x: next, animated: true });
  };

  return (
    <View style={styles.section} accessibilityLabel="Academy">
      <Eyebrow>{a.eyebrow}</Eyebrow>
      <Txt variant="h2" style={{ maxWidth: "80%" }}>
        {a.h2}
      </Txt>
      {/* Web: "mt-3 inline-block text-[15px] font-bold" link to #/baccalaureate */}
      <Pressable
        onPress={() => {
          import("expo-router").then(({ router }) => router.push("/baccalaureate" as never));
        }}
        style={{ marginTop: 12 }}
        accessibilityRole="link"
      >
        <Txt variant="body" style={{ color: palette.accent, fontWeight: "700" }}>
          {a.bacLink}
        </Txt>
      </Pressable>

      {error ? (
        <View style={styles.stateBox}>
          <Txt variant="body" tone="muted" style={{ textAlign: "center" }}>
            {t.catalog?.empty ?? "…"}
          </Txt>
        </View>
      ) : courses === null ? (
        <View style={{ flexDirection: "row", gap: 16, marginTop: 32 }}>
          <View style={[styles.card, { opacity: 0.5 }]} />
          <View style={[styles.card, { opacity: 0.3 }]} />
        </View>
      ) : (
        <>
          <ScrollView
            ref={railRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={316}
            decelerationRate="fast"
            style={styles.rail}
            contentContainerStyle={styles.railContent}
            onScroll={(e) => {
              railX.current = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={64}
          >
            {cards.map((c) => (
              <CourseCard key={c.slug} course={c} onPress={() => setActive(c)} />
            ))}
          </ScrollView>
          <View style={styles.arrows}>
            <Pressable onPress={() => scrollBy(-1)} style={styles.arrowBtn} accessibilityLabel="Previous courses">
              <Chev size={20} color={palette.fg} />
            </Pressable>
            <Pressable onPress={() => scrollBy(1)} style={styles.arrowBtn} accessibilityLabel="Next courses">
              <Chev next size={20} color={palette.fg} />
            </Pressable>
          </View>
        </>
      )}

      <CourseModal
        course={active}
        onClose={() => setActive(null)}
        onDetails={(slug) => {
          setActive(null);
          // details route within the app
          import("expo-router").then(({ router }) => router.push(`/course/${slug}` as never));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: palette.white,
    // Web .section padding-block: clamp(48px, 7vw, ...) -> 48px on phones.
    paddingVertical: 48,
    // Web .kt-wrap gutter (index.css --gutter: 32px).
    paddingLeft: 32,
  },
  lead: { marginTop: 14, maxWidth: 480 },
  rail: { marginTop: 32, flexGrow: 0 },
  railContent: { gap: 16, paddingRight: 16 },
  card: {
    width: 300,
    height: 420,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
  arrows: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
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
  stateBox: {
    marginTop: 32,
    padding: 24,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
  },
});
