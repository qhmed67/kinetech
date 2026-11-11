import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button, Pill, Tabs } from "@kinetech/ui-native";
import { useLang } from "../../src/lang";
import { useAuth } from "../../src/auth";
import {
  listCourses,
  type CourseCard as Course,
} from "../../src/lib/db/catalog";
import { getWatchState, type WatchRow } from "../../src/lib/db/watch";
import {
  getNotifications,
  getUpcomingSessions,
  markNotificationsRead,
  type AppNotification,
  type UpcomingSession,
} from "../../src/lib/db/activity";
import {
  getCourseWork,
  type ExamKind,
  type LessonWork,
} from "../../src/lib/db/exams";
import { palette, elevation } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Divider } from "../../src/components/Section";
import { Txt } from "../../src/components/Txt";
import { CourseCard } from "../../src/components/CourseCard";
import { EmptyState } from "../../src/components/States";
import { ExamSheet } from "../../src/components/ExamSheet";

type TabKey = "overview" | "courses" | "exams" | "assignments" | "profile";

type CourseProgress = {
  course: Course;
  rows: WatchRow[];
  done: number;
  total: number;
  nextIdx: number;
  live: boolean;
};

const WA = "https://wa.me/201042031062";

export default function Dashboard() {
  const { t, lang, toggle } = useLang();
  const { user, ready, signOut } = useAuth();
  const router = useRouter();
  const d = t.dashboard;

  const [tab, setTab] = useState<TabKey>("overview");
  const [progress, setProgress] = useState<CourseProgress[] | null>(null);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [work, setWork] = useState<Record<string, LessonWork[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exam, setExam] = useState<{ videoId: string; kind: ExamKind } | null>(null);
  const [workTick, setWorkTick] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await listCourses(lang, { limit: 60 });
      const mine = all.filter((c) => user.enrolled.includes(c.slug));
      const rowsList = await Promise.all(
        mine.map(async (course) => {
          try {
            const rows = await getWatchState(course.slug, lang);
            const done = rows.filter((r) => r.done).length;
            const next = rows.find((r) => r.unlocked && !r.done);
            return {
              course,
              rows,
              done,
              total: rows.length,
              nextIdx: next?.sort_order ?? 0,
              live: true,
            };
          } catch {
            return {
              course,
              rows: [],
              done: 0,
              total: 0,
              nextIdx: 0,
              live: false,
            };
          }
        }),
      );
      setProgress(rowsList);
      setFailed(false);
    } catch {
      setProgress([]);
      setFailed(true);
    }
    try {
      const [n, s] = await Promise.all([
        getNotifications(6),
        getUpcomingSessions(4),
      ]);
      setNotifs(n);
      setSessions(s);
      void markNotificationsRead();
    } catch {
      setNotifs([]);
      setSessions([]);
    }
  }, [user, lang]);

  useEffect(() => {
    if (!user) return;
    setProgress(null);
    void load();
  }, [load, user?.email]);

  useEffect(() => {
    if (!user || (tab !== "exams" && tab !== "assignments")) return;
    let alive = true;
    const mine = (progress ?? []).map((p) => p.course);
    void Promise.all(
      mine.map(async (course) => ({
        slug: course.slug,
        items: await getCourseWork(course.slug, lang).catch(() => []),
      })),
    ).then((rows) => {
      if (!alive) return;
      const next: Record<string, LessonWork[]> = {};
      rows.forEach((r) => {
        next[r.slug] = r.items;
      });
      setWork(next);
    });
    return () => {
      alive = false;
    };
  }, [tab, progress, lang, user, workTick]);

  const stats = useMemo(() => {
    const list = progress ?? [];
    const doneLessons = list.reduce((n, p) => n + p.done, 0);
    const minutes = list.reduce(
      (n, p) =>
        n +
        p.rows
          .filter((r) => r.done)
          .reduce((m, r) => m + (r.mins || 0), 0),
      0,
    );
    return { doneLessons, hours: Math.round((minutes / 60) * 10) / 10 };
  }, [progress]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <EmptyState
          title={lang === "ar" ? "سجّل الدخول لعرض تقدمك" : "Sign in to see your progress"}
          note={
            lang === "ar"
              ? "لوحتك تجمع كورساتك وامتحاناتك وإشعاراتك."
              : "Your dashboard keeps your courses, exams and notices together."
          }
          actionLabel={t.nav.signin}
          onAction={() => router.push("/sign-in")}
          icon="person-circle-outline"
        />
      </Screen>
    );
  }

  if (user.banned) {
    return (
      <Screen>
        <EmptyState
          title={d.bannedT}
          note={d.bannedD}
          actionLabel={t.contact.wa}
          onAction={() => void Linking.openURL(WA)}
          icon="ban-outline"
        />
      </Screen>
    );
  }

  const tabs = [
    { value: "overview", label: d.tabs[0] },
    { value: "courses", label: d.tabs[1] },
    { value: "exams", label: d.tabs[2] },
    { value: "assignments", label: d.tabs[3] },
    { value: "profile", label: d.tabs[4] },
  ];

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
        <Txt variant="h2">{d.title}</Txt>
        <Txt variant="small" style={styles.sub}>
          {d.sub}
        </Txt>
      </View>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        tabs={tabs}
        style={styles.tabs}
      />

      {progress === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : failed ? (
        <EmptyState
          title={lang === "ar" ? "تعذّر تحميل اللوحة" : "Couldn't load your dashboard"}
          note={
            lang === "ar"
              ? "تحقق من الاتصال وحاول مرة أخرى."
              : "Check your connection and try again."
          }
          actionLabel={t.watch.retryBtn}
          onAction={() => void load()}
          icon="cloud-offline-outline"
        />
      ) : tab === "overview" ? (
        <View style={styles.section}>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Txt variant="meta" style={styles.statLabel}>
                {d.hours}
              </Txt>
              <Txt variant="h2" tone="accent">
                {stats.hours}
              </Txt>
            </View>
            <View style={styles.statCard}>
              <Txt variant="meta" style={styles.statLabel}>
                {d.doneLessons}
              </Txt>
              <Txt variant="h2" tone="accent">
                {stats.doneLessons}
              </Txt>
            </View>
          </View>

          {progress.length === 0 ? (
            <EmptyState
              title={d.noCoursesT}
              note={d.noCoursesD}
              actionLabel={d.browseCatalog}
              onAction={() => router.push("/(tabs)/courses")}
              icon="book-outline"
            />
          ) : (
            <View style={styles.stack}>
              {progress.slice(0, 3).map((p) => (
                <View key={p.course.slug} style={styles.continueCard}>
                  <View style={styles.flex}>
                    <Txt variant="title" numberOfLines={2}>
                      {p.course.name}
                    </Txt>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`,
                          },
                        ]}
                      />
                    </View>
                    <Txt variant="meta" style={styles.muted}>
                      {p.done}/{p.total} {d.progress}
                    </Txt>
                  </View>
                  <Button
                    title={d.cont}
                    size="sm"
                    onPress={() => router.push(`/watch/${p.course.slug}/${p.nextIdx}`)}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={styles.block}>
            <Txt variant="title">{d.sessionsT}</Txt>
            {sessions.length === 0 ? (
              <Txt variant="small" style={styles.muted}>
                {d.upcomingEmpty}
              </Txt>
            ) : (
              sessions.map((s) => (
                <View key={s.id} style={styles.rowCard}>
                  <Ionicons name="calendar-outline" size={16} color={palette.teal} />
                  <View style={styles.flex}>
                    <Txt variant="small">{s.title}</Txt>
                    <Txt variant="meta" style={styles.muted}>
                      {new Date(s.date).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Txt>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.block}>
            <Txt variant="title">{d.notifT}</Txt>
            {notifs.length === 0 ? (
              <Txt variant="small" style={styles.muted}>
                {d.notifEmpty}
              </Txt>
            ) : (
              notifs.map((n) => (
                <View key={n.id} style={styles.rowCard}>
                  <Ionicons
                    name={n.is_read ? "notifications-outline" : "notifications"}
                    size={16}
                    color={n.is_read ? palette.border : palette.accent}
                  />
                  <View style={styles.flex}>
                    <Txt variant="small">{n.title}</Txt>
                    {n.message ? (
                      <Txt variant="meta" style={styles.muted}>
                        {n.message}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>

          <Button
            title={d.explore}
            variant="secondary"
            onPress={() => router.push("/(tabs)/courses")}
          />
        </View>
      ) : tab === "courses" ? (
        <View style={styles.section}>
          {progress.length === 0 ? (
            <EmptyState
              title={d.noCoursesT}
              note={d.noCoursesD}
              actionLabel={d.browseCatalog}
              onAction={() => router.push("/(tabs)/courses")}
              icon="book-outline"
            />
          ) : (
            <View style={styles.stack}>
              {progress.map((p) => (
                <CourseCard
                  key={p.course.slug}
                  course={p.course}
                  progress={{ done: p.done, total: p.total }}
                  onPress={() => router.push(`/course/${p.course.slug}`)}
                />
              ))}
            </View>
          )}
        </View>
      ) : tab === "exams" || tab === "assignments" ? (
        <View style={styles.section}>
          {progress.length === 0 ? (
            <EmptyState
              title={d.lockedTabsD}
              note={d.noCoursesD}
              actionLabel={d.browseCatalog}
              onAction={() => router.push("/(tabs)/courses")}
              icon="document-text-outline"
            />
          ) : (
            progress.map((p) => {
              const kind: ExamKind = tab === "exams" ? "exam" : "assignment";
              const items = (work[p.course.slug] ?? []).filter((i) =>
                kind === "exam" ? i.exam : i.assign,
              );
              return (
                <View key={p.course.slug} style={styles.block}>
                  <Txt variant="title">{p.course.name}</Txt>
                  {items.length === 0 ? (
                    <Txt variant="small" style={styles.muted}>
                      {d.emptyWork}
                    </Txt>
                  ) : (
                    items.map((item) => {
                      const state = kind === "exam" ? item.exam : item.assign;
                      if (!state) return null;
                      const label =
                        state.state === "graded"
                          ? `${d.workReview} · ${state.score}/${state.total}`
                          : state.state === "pending"
                            ? d.workWaiting
                            : d.workSolve;
                      const done = state.state === "graded";
                      return (
                        <Pressable
                          key={`${p.course.slug}-${item.videoId}-${kind}`}
                          style={styles.workRow}
                          onPress={() =>
                            setExam({ videoId: item.videoId, kind })
                          }
                        >
                          <View style={styles.flex}>
                            <Txt variant="small">{item.title}</Txt>
                            <Txt
                              variant="meta"
                              style={done ? styles.graded : styles.muted}
                            >
                              {label}
                            </Txt>
                          </View>
                          <Ionicons
                            name={
                              done
                                ? "checkmark-circle"
                                : "chevron-forward-outline"
                            }
                            size={17}
                            color={done ? palette.teal : palette.muted}
                          />
                        </Pressable>
                      );
                    })
                  )}
                </View>
              );
            })
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Txt variant="h3" tone="white">
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </Txt>
            </View>
            <Txt variant="h3">{user.name}</Txt>
            <Txt variant="small" style={styles.muted}>
              {user.email}
            </Txt>
            {user.phone ? (
              <Txt variant="small" style={styles.muted}>
                {user.phone}
              </Txt>
            ) : null}
            <Pill
              label={user.role === "admin" ? "ADMIN" : "STUDENT"}
              tone={user.role === "admin" ? "accent" : "soft"}
              style={styles.rolePill}
            />
            <Txt variant="meta" center style={styles.profileNote}>
              {d.profileLocked}
            </Txt>
          </View>

          <View style={styles.block}>
            <Txt variant="title">{d.tracksT}</Txt>
            <View style={styles.trackChips}>
              {(user.tracks.length > 0 ? user.tracks : ["courses"]).map((tr: string) => (
                <View key={tr} style={styles.trackChip}>
                  <Txt variant="meta" style={styles.trackChipText}>
                    {d.trackNames[tr as keyof typeof d.trackNames] ?? tr}
                  </Txt>
                </View>
              ))}
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.settingsRow}>
            <View style={styles.flex}>
              <Txt variant="small">{d.langL}</Txt>
              <Txt variant="meta" style={styles.muted}>
                {lang === "ar" ? "العربية" : "English"}
              </Txt>
            </View>
            <Button
              title={t.toggle}
              variant="secondary"
              size="sm"
              onPress={toggle}
            />
          </View>

          <Button
            title={t.nav.signout}
            variant="secondary"
            onPress={() => {
              void signOut().then(() => router.replace("/sign-in"));
            }}
            style={styles.signout}
          />
        </View>
      )}

      <ExamSheet
        videoId={exam?.videoId ?? null}
        kind={exam?.kind ?? "exam"}
        onClose={() => setExam(null)}
        onSubmitted={() => setWorkTick((n) => n + 1)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: 22, gap: 6 },
  sub: { color: palette.muted },
  tabs: { marginTop: 16 },
  loading: { paddingTop: 40, alignItems: "center" },
  section: { paddingTop: 18, gap: 18 },
  stack: { gap: 14 },
  statRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    padding: 15,
    gap: 4,
    ...elevation.card,
  },
  statLabel: { color: palette.muted, fontSize: 11.5 },
  continueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    padding: 15,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: palette.surface,
    overflow: "hidden",
    marginTop: 9,
    marginBottom: 6,
  },
  progressFill: { height: "100%", backgroundColor: palette.accent, borderRadius: 999 },
  muted: { color: palette.muted },
  block: { gap: 10 },
  rowCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 14,
    padding: 12,
  },
  workRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 14,
    padding: 12,
  },
  graded: { color: palette.teal },
  profileCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    gap: 5,
  },
  profileAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  rolePill: { marginTop: 8 },
  profileNote: { marginTop: 10, maxWidth: 300 },
  trackChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  trackChip: {
    backgroundColor: palette.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  trackChipText: { fontSize: 11.5, color: palette.muted },
  divider: { marginVertical: 4 },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  signout: { alignSelf: "stretch" },
  flex: { flex: 1 },
});
