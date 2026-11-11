/* Web CourseDetail port (apps/web/src/pages/CourseDetail.tsx): back link,
 * image + info (bac badge, facts with teal icons, price, enroll), then
 * curriculum / instructor / outcomes, then the slim sticky enroll bar that
 * slides in after scrolling past the top. */

import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useLocalSearchParams, router } from "expo-router";
import { useLang } from "../../src/lang";
import { getCourse, type CourseView } from "../../src/lib/db/catalog";
import { ktFont, palette } from "../../src/theme";
import { Footer } from "../../src/components/web/Footer";
import { TopBar } from "../../src/components/web/TopBar";
import { Txt } from "../../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";

function FactIcon({ path }: { path: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <Circle cx="12" cy="12" r="9" stroke={palette.teal} strokeWidth="2" opacity={0} />
      <Path d={path} stroke={palette.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function CourseDetailPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useLang();
  const d = t.detail;
  const [course, setCourse] = useState<CourseView | null>(null);
  const [missing, setMissing] = useState(false);
  const [past, setPast] = useState(false);

  useEffect(() => {
    let alive = true;
    setMissing(false);
    getCourse(String(slug ?? ""), lang)
      .then((c) => {
        if (!alive) return;
        if (c) setCourse(c);
        else setMissing(true);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug, lang]);

  const price = course?.price ?? d.contactPricing;

  const facts = useMemo(
    () => [
      { label: d.duration, value: course?.duration ?? "", icon: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
      { label: d.lessons, value: course?.lessons ?? "", icon: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 5.5v15" },
      { label: d.scheduleL, value: course?.schedule ?? "", icon: "M8 3v4M16 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" },
    ],
    [course, d],
  );

  if (!course) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        {missing && (
          <>
            <Txt variant="h3">{t.watch.noCourseT}</Txt>
            <Txt variant="body" tone="muted" style={{ marginTop: 8, textAlign: "center" }}>
              {t.watch.noCourseD}
            </Txt>
            <Button
              title={d.back}
              variant="secondary"
              onPress={() => router.back()}
              style={{ marginTop: 20 }}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          // "past the top" ≈ one viewport of scroll (web IntersectionObserver).
          if (y > 360 && !past) setPast(true);
          else if (y <= 360 && past) setPast(false);
        }}
        scrollEventThrottle={64}
      >
        <Pressable onPress={() => router.push("/courses" as never)}>
          <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
            {d.back}
          </Txt>
        </Pressable>

        <View style={styles.top}>
          <View style={{ flex: 1, minWidth: 280 }}>
            {course.bac && (
              <View style={styles.bacBadge}>
                <Txt style={styles.bacBadgeText}>{t.catalog.catBac}</Txt>
              </View>
            )}
            <View style={styles.imgWrap}>
              {course.photoDetail || course.photoCard ? (
                <Image
                  source={{ uri: course.photoDetail || course.photoCard }}
                  style={styles.img}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 280 }}>
            <Txt variant="h1" style={{ fontSize: 30 }}>
              {course.name}
            </Txt>
            <Txt variant="body" tone="muted" style={styles.quote}>
              {course.quote}
            </Txt>
            <View style={styles.facts}>
              {facts.map((f) => (
                <View key={f.label} style={styles.factRow}>
                  <FactIcon path={f.icon} />
                  <Txt variant="small" tone="muted">
                    {f.label}
                  </Txt>
                  <Txt variant="small" style={{ fontWeight: "700", flexShrink: 1 }}>
                    {f.value}
                  </Txt>
                </View>
              ))}
            </View>
            <Txt style={styles.priceLabel}>{d.priceL}</Txt>
            <Txt
              variant="h1"
              style={{ color: palette.accent, fontSize: 36, marginTop: 4, letterSpacing: -0.7 }}
            >
              {price}
            </Txt>
            <Button
              title={d.enroll}
              variant="primary"
              onPress={() => void Linking.openURL(WA).catch(() => {})}
              style={{ marginTop: 20, paddingVertical: 14, alignSelf: "flex-start", paddingHorizontal: 40 }}
              textStyle={{ fontSize: 16 }}
            />
          </View>
        </View>

        {/* CURRICULUM + INSTRUCTOR/OUTCOMES */}
        <View style={styles.lower}>
          <View style={{ flex: 1, minWidth: 280 }}>
            <Txt variant="h2" style={{ fontSize: 24 }}>
              {d.curriculum}
            </Txt>
            <View style={styles.divide}>
              {course.modules.map((m) => (
                <View key={`${m.t}`} style={styles.moduleRow}>
                  <Txt variant="h4">{m.t}</Txt>
                  <Txt variant="body" tone="muted" style={styles.moduleDesc}>
                    {m.d}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 280 }}>
            <View style={styles.instrRow}>
              <View style={styles.instrAvatar}>
                <Txt style={{ color: palette.accent, fontSize: 18, fontWeight: "700" }}>
                  {course.instructor.name.replace(/^(ENG\/|م\/)\s*/, "").trim().charAt(0) || "?"}
                </Txt>
              </View>
              <View style={{ flexShrink: 1 }}>
                <Txt variant="h4">{course.instructor.name}</Txt>
                <Txt variant="small" tone="muted">
                  {course.instructor.spec}
                </Txt>
              </View>
            </View>
            {course.outcomes.length > 0 && (
              <>
                <Txt variant="h2" style={{ fontSize: 24, marginTop: 32 }}>
                  {d.includesT}
                </Txt>
                <View style={{ gap: 10, marginTop: 16 }}>
                  {course.outcomes.map((o) => (
                    <View key={o} style={styles.outcomeRow}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginTop: 4, flexShrink: 0 }}>
                        <Path d="M4 12.5 9.5 18 20 6.5" stroke={palette.teal} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                      <Txt variant="body" style={{ flexShrink: 1 }}>
                        {o}
                      </Txt>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Footer />

      {/* slim sticky enroll — slides in after scrolling past the top */}
      {past && (
        <View style={styles.stickyBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="small" numberOfLines={1}>
              <Txt variant="small" style={{ fontWeight: "700" }}>
                {course.name}
              </Txt>
              {" · "}
            </Txt>
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {price}
            </Txt>
          </View>
          <Button
            title={d.enroll}
            variant="primary"
            size="sm"
            onPress={() => void Linking.openURL(WA).catch(() => {})}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  content: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 80 },
  top: {
    marginTop: 24,
    gap: 32,
  },
  bacBadge: {
    alignSelf: "flex-start",
    marginBottom: 12,
    borderRadius: 999,
    backgroundColor: "rgba(59,188,217,0.16)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  bacBadgeText: {
    color: palette.deep,
    fontSize: 12,
    fontWeight: "700",
  },
  imgWrap: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    overflow: "hidden",
    minHeight: 220,
    justifyContent: "center",
  },
  img: { width: "100%", height: 260 },
  quote: { marginTop: 12 },
  facts: { marginTop: 28, gap: 14 },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  priceLabel: {
    marginTop: 32,
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.44,
    textTransform: "uppercase",
    fontFamily: ktFont(700),
  },
  lower: {
    marginTop: 64,
    gap: 48,
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
  },
  divide: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  moduleRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  moduleDesc: { marginTop: 4, lineHeight: 22 },
  instrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  instrAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  outcomeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
});
