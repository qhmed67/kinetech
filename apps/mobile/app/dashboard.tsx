/* Web Dashboard port (apps/web/src/pages/Dashboard.tsx): avatar header,
 * tab chips (+ tracks expander + signout), overview stats/sessions/notifs
 * widgets, course cards with gradient progress bars, exam/assignment Work
 * rows (todo/pending/graded → ReviewOpener), service track cards, profile,
 * settings, and the track activation modal. Server truth wins for progress
 * and coursework; local cache is the fallback. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { router } from "expo-router";
import { useLang } from "../src/lang";
import { useAuth } from "../src/auth";
import { initialsOf, type KtUser } from "../src/authDb";
import { getUser, setUser, syncMyGrants, addTrackToCloud } from "../src/lib/sync";
import { ensureWatchCache, isDone, getViews, purgeProgress } from "../src/lib/watch";
import { listCourses, getCourse, type CourseView } from "../src/lib/db/catalog";
import { getWatchState } from "../src/lib/db/watch";
import { getCourseWorkStatus, videoIdBySlug, type LessonWork, type WorkItemState } from "../src/lib/db/exams";
import { getUpcomingSessions, getNotifications, markNotificationsRead } from "../src/lib/db/activity";
import { ktGradient, palette } from "../src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { ExamTake } from "../src/components/web/ExamTake";
import { Txt } from "../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";
const TRACKS = ["courses", "marketing", "programming", "design"] as const;
type Track = (typeof TRACKS)[number];
const TABS_ALL = ["overview", "courses", "exams", "assignments", "profile", "settings"] as const;

type Progress = { progress: number; hours: number; done: number; total: number };

/** In-dashboard exam review: opens the exam widget right here — no
 * navigation, no video autoplay accidents. */
function ReviewOpener({ slug, idx, kind, label }: { slug: string; idx: number; kind: "exam" | "assignment"; label: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        title={label}
        variant="secondary"
        size="sm"
        disabled={busy}
        onPress={() => {
          if (busy) return;
          setBusy(true);
          void videoIdBySlug(slug, idx)
            .then((videoId) => {
              if (videoId) setOpen(videoId);
            })
            .catch(() => {
              /* offline — stays closed */
            })
            .finally(() => setBusy(false));
        }}
      />
      {open && <ExamTake videoId={open} kind={kind} startInReview onClose={() => setOpen(null)} />}
    </>
  );
}

/** Structured exam/assignment rows for one tab (todo → solve, pending →
 * waiting, graded → review). Mobile renders RPC-backed rows only (the
 * web's legacy attachment links are store-seeded and never shipped). */
function WorkTab({
  slugs,
  kind,
  lessonWork,
  emptyTitle,
  emptyDesc,
}: {
  slugs: string[];
  kind: "exam" | "assignment";
  lessonWork: Record<string, LessonWork[]>;
  emptyTitle: string;
  emptyDesc: string;
}) {
  const { t } = useLang();
  const d = t.dashboard;
  const rows: Array<{ key: string; course: string; slug: string; idx: number; title: string; item: WorkItemState }> = [];
  for (const slug of slugs) {
    const course = lessonWork[slug];
    for (const l of course ?? []) {
      const item = kind === "exam" ? l.exam : l.assign;
      if (item) {
        rows.push({ key: `${slug}:${l.sort_order}:${kind}`, course: l.title ? "" : slug, slug, idx: l.sort_order, title: l.title, item });
      }
    }
  }
  if (rows.length === 0) {
    return (
      <View style={styles.emptyPanel}>
        <Txt variant="h3">{emptyTitle}</Txt>
        <Txt variant="small" tone="muted" style={styles.emptyDesc}>
          {emptyDesc}
        </Txt>
        <Button title={d.browseCatalog} variant="primary" onPress={() => router.push("/courses" as never)} style={{ marginTop: 20 }} />
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r) => (
        <View key={r.key} style={styles.workRow}>
          <View style={{ flexShrink: 1, flex: 1 }}>
            <Txt variant="h4">{r.title}</Txt>
          </View>
          <View style={styles.workActions}>
            {r.item.state === "pending" ? (
              <View style={styles.pendingChip}>
                <Txt style={{ color: "#9A6B1B", fontSize: 14, fontWeight: "700" }}>{d.workWaiting}</Txt>
              </View>
            ) : r.item.state === "graded" ? (
              <>
                <View style={styles.gradedChip}>
                  <Txt style={{ color: palette.deep, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {r.item.score}/{r.item.total}
                  </Txt>
                </View>
                <ReviewOpener slug={r.slug} idx={r.idx} kind={kind} label={d.workReview} />
              </>
            ) : (
              <Button
                title={d.workSolve}
                variant="primary"
                size="sm"
                onPress={() => router.push(`/watch/${r.slug}/${r.idx}` as never)}
              />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DashboardPage() {
  const { t, lang, toggle } = useLang();
  const d = t.dashboard;
  const w = t.watch;
  const { user: ctxUser, refresh, signOut } = useAuth();
  const [user, setUserState] = useState<KtUser | null>(null);
  const [tracks, setTracks] = useState<string[]>(["courses"]);
  const [modal, setModal] = useState<Track | null>(null);
  const [catalog, setCatalog] = useState<CourseView[]>([]);
  const [tab, setTab] = useState<string>("overview");
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; title: string; date: string }[] | null>(null);
  const [notifs, setNotifs] = useState<{ id: string; title: string; message: string; is_read: boolean }[] | null>(null);
  const [cloudSession, setCloudSession] = useState<boolean | null>(null);
  const [lessonWork, setLessonWork] = useState<Record<string, LessonWork[]>>({});
  const [serverProg, setServerProg] = useState<Record<string, Progress>>({});
  const [localProg, setLocalProg] = useState<Record<string, Progress>>({});

  // Hydrate the cached user (profile + grants + tracks).
  useEffect(() => {
    let alive = true;
    const u = getUser();
    if (u) setUserState(u);
    return () => {
      alive = false;
    };
  }, [ctxUser]);

  useEffect(() => {
    if (user) setTracks(user.tracks ?? ["courses"]);
  }, [user]);

  const hasCourses = tracks.includes("courses");
  const activeServices = (TRACKS as readonly string[]).filter(
    (tr) => tr !== "courses" && tracks.includes(tr),
  );
  const TABS = useMemo(
    () => ["overview", "courses", ...(hasCourses ? ["exams", "assignments"] : []), ...activeServices, "profile", "settings"],
    [hasCourses, activeServices],
  );

  // Re-adopt server grants on open: a course revoked while browsing must
  // disappear (with its local progress purged) instead of showing stale bars.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void syncMyGrants().then((changed) => {
      if (alive && changed) {
        const u = getUser();
        if (u) setUserState(u);
      }
    });
    void ensureWatchCache();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Live activity (server truth). Null = loading; [] = empty state.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      try {
        const [s, n] = await Promise.all([getUpcomingSessions(4), getNotifications(6)]);
        if (!alive) return;
        setSessions(s);
        setNotifs(n);
        if (n.some((x) => !x.is_read)) {
          void markNotificationsRead().then(() => {
            if (alive) setNotifs((cur) => (cur ?? []).map((x) => ({ ...x, is_read: true })));
          });
        }
      } catch {
        if (alive) {
          setSessions((cur) => cur ?? []);
          setNotifs((cur) => cur ?? []);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const fmtDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return iso;
    }
  };
  const fmtTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };
  const unread = (notifs ?? []).filter((n) => !n.is_read).length;

  // Catalog for card + existence checks.
  useEffect(() => {
    let alive = true;
    void listCourses(lang, { limit: 100 })
      .then((rows) => alive && setCatalog(rows))
      .catch(() => alive && setCatalog([]));
    return () => {
      alive = false;
    };
  }, [lang]);

  // Admin-granted enrollments only (WhatsApp payment verified by staff).
  const enrolledSlugs = useMemo(() => {
    const known = new Set(catalog.map((c) => c.slug));
    const list = user?.enrolled ?? [];
    return catalog.length > 0 ? list.filter((s) => known.has(s)) : list;
  }, [user?.enrolled, catalog]);

  // Structured lesson work (real exams/assignments).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const out: Record<string, LessonWork[]> = {};
      for (const slug of enrolledSlugs) {
        try {
          out[slug] = await getCourseWorkStatus(slug, lang);
        } catch {
          /* lesson keeps no rows */
        }
      }
      if (alive) setLessonWork(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, enrolledSlugs.join(","), lang]);

  // Server truth wins for progress — but ONLY when the server actually has
  // rows for the course. Empty answers keep the local fallback.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const out: Record<string, Progress> = {};
      for (const slug of enrolledSlugs) {
        try {
          const rows = await getWatchState(slug, lang);
          if (rows.length === 0) continue;
          const watched = rows.filter((r) => r.done || r.views_count > 0);
          const mins = watched.reduce((a, r) => a + (r.mins || 0), 0);
          out[slug] = {
            progress: Math.round((watched.length / rows.length) * 100),
            hours: Math.round((mins / 60) * 10) / 10,
            done: watched.length,
            total: rows.length,
          };
        } catch {
          /* keep local fallback for this course */
        }
      }
      if (alive) setServerProg(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, enrolledSlugs.join(","), lang]);

  // Local fallback (offline / no server rows): cache + course details.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const out: Record<string, Progress> = {};
      for (const slug of enrolledSlugs) {
        try {
          const course = await getCourse(slug, "en");
          const total = course?.modules.length ?? 0;
          if (total === 0) continue;
          const rows = await getWatchState(slug, lang).catch(() => []);
          let done = 0;
          let mins = 0;
          for (let i = 0; i < total; i++) {
            if (isDone(user, slug, i) || getViews(user, slug, i) > 0) {
              done += 1;
              mins += rows[i]?.mins ?? 0;
            }
          }
          out[slug] = { progress: Math.round((done / total) * 100), hours: Math.round((mins / 60) * 10) / 10, done, total };
        } catch {
          /* skip */
        }
      }
      if (alive) setLocalProg(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, enrolledSlugs.join(","), lang, notifs]);

  if (!user) return null;

  if (user.banned) {
    return (
      <View style={styles.root}>
        <View style={[styles.bannedCard, { borderColor: palette.err }]}>
          <Txt variant="h3" style={{ color: palette.err }}>
            {d.bannedT}
          </Txt>
          <Txt variant="small" tone="muted" style={styles.emptyDesc}>
            {d.bannedD}
          </Txt>
          <Button title="WhatsApp" variant="primary" onPress={() => void Linking.openURL(WA).catch(() => {})} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  const progBySlug = new Map<string, Progress>();
  for (const slug of enrolledSlugs) {
    const p = serverProg[slug] ?? localProg[slug];
    if (p) progBySlug.set(slug, p);
  }
  const hours = Math.round([...progBySlug.values()].reduce((a, p) => a + p.hours, 0) * 10) / 10;
  const lessonsDone = [...progBySlug.values()].reduce((a, p) => a + p.done, 0);

  const tabLabel = (tb: string): string => {
    const i = (TABS_ALL as readonly string[]).indexOf(tb);
    if (i >= 0) return d.tabs[i];
    return d.trackNames[tb as Track] ?? tb;
  };

  const activate = (tr: Track) => {
    if (tracks.includes(tr)) {
      setModal(null);
      return;
    }
    const next = [...tracks, tr];
    setTracks(next);
    setUser({ ...user, tracks: next });
    // Persist server-side so the space survives across devices (best-effort).
    void addTrackToCloud(tr);
    void refresh();
    setModal(null);
    setTab(tr === "courses" ? "courses" : tr);
  };

  const lockedCard = (title: string, desc: string, cta: string, onCta: () => void) => (
    <View style={styles.emptyPanel}>
      <Txt variant="h3">{title}</Txt>
      <Txt variant="small" tone="muted" style={styles.emptyDesc}>
        {desc}
      </Txt>
      <Button title={cta} variant="primary" onPress={onCta} style={{ marginTop: 20 }} />
    </View>
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headRow}>
          <View style={styles.avatar}>
            <Txt style={{ color: palette.white, fontSize: 20, fontWeight: "700" }}>
              {initialsOf(user.name)}
            </Txt>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Txt style={styles.eyebrow}>{d.enrolled}</Txt>
            <Txt variant="h2">{d.title}</Txt>
          </View>
        </View>

        {/* tab chips row (web's lg sidebar becomes a phone chip row) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tb) => (
            <Pressable
              key={tb}
              onPress={() => {
                setTab(tb);
                setSpacesOpen(false);
              }}
              style={[styles.tabBtn, tab === tb && styles.tabBtnOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === tb }}
            >
              <Txt variant="small" style={{ fontWeight: "700", color: tab === tb ? "#fff" : palette.muted }}>
                {tabLabel(tb)}
              </Txt>
            </Pressable>
          ))}
          <View>
            <Pressable
              onPress={() => setSpacesOpen((v) => !v)}
              style={[styles.tabBtn, spacesOpen && styles.tabBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ expanded: spacesOpen }}
            >
              <Txt variant="small" style={{ fontWeight: "700", color: spacesOpen ? "#fff" : palette.muted }}>
                {d.tracksT}
              </Txt>
            </Pressable>
            {spacesOpen && (
              <View style={styles.spacesPanel}>
                {TRACKS.map((tr) => {
                  const isActive = tracks.includes(tr);
                  return (
                    <Pressable
                      key={tr}
                      onPress={() => {
                        if (!isActive) setModal(tr);
                        else setTab(tr);
                      }}
                      style={styles.spaceRow}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                    >
                      <View style={[styles.spaceDot, { backgroundColor: isActive ? palette.teal : palette.surface }]}>
                        {isActive ? (
                          <Txt style={{ color: palette.deep, fontSize: 10, fontWeight: "700" }}>✓</Txt>
                        ) : (
                          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                            <Rect x="5" y="11" width="14" height="9" rx="2" stroke={palette.muted} strokeWidth="2.4" />
                            <Path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={palette.muted} strokeWidth="2.4" strokeLinecap="round" />
                          </Svg>
                        )}
                      </View>
                      <Txt variant="small" style={{ fontWeight: "700", color: isActive ? palette.fg : palette.muted }}>
                        {d.trackNames[tr]}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          <Pressable onPress={() => void signOut()} style={styles.tabBtn}>
            <Txt variant="small" style={{ fontWeight: "700", color: palette.err }}>
              {t.nav.signout}
            </Txt>
          </Pressable>
        </ScrollView>

        <View style={{ marginTop: 24 }}>
          {tab === "overview" && (
            <View style={{ gap: 16 }}>
              <View style={styles.statRow}>
                {[
                  { label: d.enrolled, value: String(enrolledSlugs.length) },
                  { label: d.hours, value: String(hours) },
                  { label: d.doneLessons, value: String(lessonsDone) },
                ].map((s) => (
                  <View key={s.label} style={styles.statCard}>
                    <Txt variant="meta" tone="muted">
                      {s.label}
                    </Txt>
                    <Txt variant="h2" style={{ marginTop: 4, fontVariant: ["tabular-nums"] }}>
                      {s.value}
                    </Txt>
                  </View>
                ))}
              </View>
              <View style={styles.card}>
                <Txt variant="h4">{d.sessionsT}</Txt>
                {sessions === null ? (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <View style={styles.skeletonRow} />
                    <View style={styles.skeletonRow} />
                  </View>
                ) : cloudSession === false ? (
                  <Txt variant="small" style={styles.warnNote}>
                    {lang === "ar"
                      ? "الجلسة انتهت — سجّل خروج وسجّل دخول تاني عشان التنبيهات تظهر."
                      : "Session expired — sign out and sign in again to load notices."}
                  </Txt>
                ) : sessions.length === 0 ? (
                  <Txt variant="small" style={[styles.emptyNote, { marginTop: 12 }]}>
                    {d.upcomingEmpty}
                  </Txt>
                ) : (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    {sessions.map((s) => (
                      <View key={s.id} style={styles.listRow}>
                        <Txt variant="small" style={{ fontWeight: "700", flexShrink: 1 }}>
                          {s.title}
                        </Txt>
                        <Txt variant="small" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                          {fmtDate(s.date)} · {fmtTime(s.date)}
                        </Txt>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.card}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Txt variant="h4">{d.notifT}</Txt>
                  {unread > 0 && (
                    <View style={styles.unreadBadge}>
                      <Txt style={{ color: "#fff", fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                        {unread}
                      </Txt>
                    </View>
                  )}
                </View>
                {notifs === null ? (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <View style={styles.skeletonRow} />
                    <View style={styles.skeletonRow} />
                  </View>
                ) : notifs.length === 0 ? (
                  <Txt variant="small" style={[styles.emptyNote, { marginTop: 12 }]}>
                    {d.notifEmpty}
                  </Txt>
                ) : (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    {notifs.map((n) => (
                      <View key={n.id} style={[styles.listRowCol, { opacity: n.is_read ? 0.75 : 1 }]}>
                        <Txt variant="small" style={{ fontWeight: "700" }}>
                          {n.title}
                        </Txt>
                        {!!n.message && (
                          <Txt variant="small" tone="muted" style={{ marginTop: 2 }}>
                            {n.message}
                          </Txt>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {tab === "courses" && (
            <View style={{ gap: 16 }}>
              {!hasCourses ? (
                lockedCard(d.noCoursesT, d.noCoursesD, d.turnOn, () => setModal("courses"))
              ) : enrolledSlugs.length === 0 ? (
                <View style={{ gap: 16 }}>
                  <Txt tone="muted">{d.noCoursesD}</Txt>
                  <Pressable onPress={() => router.push("/courses" as never)}>
                    <Txt variant="body" tone="accent" style={{ fontWeight: "700" }}>
                      {d.explore}
                    </Txt>
                  </Pressable>
                </View>
              ) : (
                <>
                  {enrolledSlugs.map((slug) => {
                    const course = catalog.find((c) => c.slug === slug);
                    if (!course) return null;
                    const prog = progBySlug.get(slug) ?? { progress: 0, hours: 0 };
                    return (
                      <View key={slug} style={styles.courseRow}>
                        <Image source={{ uri: course.photoCard }} style={styles.courseImg} resizeMode="cover" />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="h4">{course.name}</Txt>
                          <View style={styles.progressTrack}>
                            <LinearGradient
                              colors={ktGradient as unknown as readonly [string, string, ...string[]]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={{ width: `${prog.progress}%`, height: "100%", borderRadius: 999 }}
                            />
                          </View>
                          <View style={styles.courseRowFoot}>
                            <Txt variant="small" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                              {prog.progress}% · {prog.hours}h
                            </Txt>
                            <Button
                              title={w.watchBtn}
                              variant="primary"
                              size="sm"
                              onPress={() => router.push(`/watch/${slug}/0` as never)}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  <Pressable onPress={() => router.push("/courses" as never)}>
                    <Txt variant="body" tone="accent" style={{ fontWeight: "700" }}>
                      {d.explore}
                    </Txt>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {tab === "exams" &&
            (enrolledSlugs.length === 0 ? (
              lockedCard(d.examsT, d.lockedTabsD, d.browseCatalog, () => router.push("/courses" as never))
            ) : (
              <WorkTab slugs={enrolledSlugs} kind="exam" lessonWork={lessonWork} emptyTitle={d.examsT} emptyDesc={d.emptyWork} />
            ))}

          {tab === "assignments" &&
            (enrolledSlugs.length === 0 ? (
              lockedCard(d.assignT, d.lockedTabsD, d.browseCatalog, () => router.push("/courses" as never))
            ) : (
              <WorkTab slugs={enrolledSlugs} kind="assignment" lessonWork={lessonWork} emptyTitle={d.assignT} emptyDesc={d.emptyWork} />
            ))}

          {activeServices.includes(tab) && (
            <View style={styles.card}>
              <Txt variant="h3">{d.trackNames[tab as Track]}</Txt>
              <Txt variant="body" tone="muted" style={{ marginTop: 8, lineHeight: 22 }}>
                {d.trackDesc[tab as Track]}
              </Txt>
              <Button
                title={d.requestService}
                variant="primary"
                onPress={() => void Linking.openURL(WA).catch(() => {})}
                style={{ marginTop: 20, alignSelf: "flex-start" }}
              />
            </View>
          )}

          {tab === "profile" && (
            <View style={[styles.card, { maxWidth: 560 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <View style={styles.avatar}>
                  <Txt style={{ color: palette.white, fontSize: 20, fontWeight: "700" }}>
                    {initialsOf(user.name)}
                  </Txt>
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="h3">{user.name}</Txt>
                  <Txt variant="small" tone="muted">
                    {user.email}
                  </Txt>
                </View>
              </View>
              <Txt variant="small" style={[styles.emptyNote, { marginTop: 20, lineHeight: 20 }]}>
                {d.profileLocked}
              </Txt>
            </View>
          )}

          {tab === "settings" && (
            <View style={{ gap: 16, maxWidth: 560 }}>
              <View style={styles.card}>
                <Txt variant="h4">{d.langL}</Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 8 }}>
                  {d.settingsNote}
                </Txt>
                <Button title={t.toggle} variant="secondary" onPress={toggle} style={{ marginTop: 16, alignSelf: "flex-start" }} />
              </View>
              <Button title={t.nav.signout} variant="secondary" onPress={() => void signOut()} style={{ alignSelf: "flex-start" }} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* track activation modal */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModal(null)} accessibilityLabel={d.activateT} />
          <View style={styles.modalPanel}>
            <Txt variant="h3">{d.activateT}</Txt>
            <Txt variant="small" tone="muted" style={{ marginTop: 8, lineHeight: 20 }}>
              {modal ? `${d.trackNames[modal]} — ${d.activateD}` : ""}
            </Txt>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Button title={d.activateYes} variant="primary" onPress={() => modal && activate(modal)} style={{ flex: 1 }} />
              <Button title={d.activateNo} variant="secondary" onPress={() => setModal(null)} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  content: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 48 },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  tabBar: { marginTop: 32, flexGrow: 0 },
  tabBarContent: { gap: 4, paddingRight: 16, alignItems: "flex-start" },
  tabBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexShrink: 0,
  },
  tabBtnOn: { backgroundColor: palette.deep },
  spacesPanel: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: palette.surface,
    padding: 4,
    gap: 2,
    minWidth: 200,
  },
  spaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  spaceDot: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 12,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 24,
  },
  skeletonRow: {
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  warnNote: {
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#FFF8E6",
    color: "#9A6B00",
    fontWeight: "700",
  },
  emptyNote: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: palette.surface,
    color: palette.muted,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    backgroundColor: palette.surface,
    padding: 12,
  },
  listRowCol: {
    borderRadius: 12,
    backgroundColor: palette.surface,
    padding: 12,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  courseRow: {
    flexDirection: "row",
    gap: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 20,
    flexWrap: "wrap",
  },
  courseImg: {
    width: "100%",
    height: 112,
    borderRadius: 16,
    backgroundColor: palette.surface,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: palette.surface,
    overflow: "hidden",
    marginTop: 12,
  },
  courseRowFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  workRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 20,
  },
  workActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pendingChip: {
    borderRadius: 999,
    backgroundColor: "#FEF3E2",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  gradedChip: {
    borderRadius: 999,
    backgroundColor: "rgba(59,188,217,0.16)",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  emptyPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 32,
    alignItems: "center",
  },
  emptyDesc: {
    marginTop: 4,
    textAlign: "center",
    maxWidth: 380,
  },
  bannedCard: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: palette.white,
    padding: 32,
    alignItems: "center",
    margin: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalPanel: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: palette.white,
    padding: 28,
  },
});
