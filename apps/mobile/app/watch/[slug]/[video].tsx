/* Web Watch page port (apps/web/src/pages/Watch.tsx) — mobile layout
 * (the web's always-visible content panel): player column + LessonExams +
 * resources, then the course content list. Gating via the same local watch
 * layer (3-view cap, sticky unlock, contiguous-watch completion) mirrored
 * from server rows on load. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useLocalSearchParams, router } from "expo-router";
import { useLang } from "../../../src/lang";
import { useAuth } from "../../../src/auth";
import { getCourse, type Module } from "../../../src/lib/db/catalog";
import {
  MAX_VIEWS,
  ensureWatchCache,
  getViews,
  isDone,
  isUnlocked,
  recordDone,
  replaceProgress,
  unlockNextOnStart,
} from "../../../src/lib/watch";
import { getWatchState, reportVideoMins, touchUnlocked } from "../../../src/lib/db/watch";
import { videoIdBySlug, getMyResult, type ExamKind } from "../../../src/lib/db/exams";
import { palette } from "../../../src/theme";
import { ProtectedPlayer, type PlayDenied } from "../../../src/components/web/ProtectedPlayer";
import { ExamTake } from "../../../src/components/web/ExamTake";
import { Txt } from "../../../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";

function StatusIcon({ state }: { state: "current" | "done" | "locked" | "todo" }) {
  if (state === "locked")
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <Rect x="5" y="11" width="14" height="9" rx="2" stroke={palette.muted} strokeWidth="2" />
        <Path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={palette.muted} strokeWidth="2" strokeLinecap="round" />
      </Svg>
    );
  if (state === "done")
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <Path d="M4 12.5 9.5 18 20 6.5" stroke={palette.teal} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  if (state === "current")
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <Path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" fill={palette.accent} opacity={0.16} />
        <Path d="M12 7v5l3 2" stroke={palette.accent} strokeWidth="2.2" strokeLinecap="round" />
      </Svg>
    );
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <Path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" stroke={palette.border} strokeWidth="2" fill="none" />
    </Svg>
  );
}

/** LessonExams — real exams/assignments attached to the lesson (RPC-gated). */
function LessonExams({ slug, idx }: { slug: string; idx: number }) {
  const { t } = useLang();
  const x = t.exam;
  const [videoId, setVideoId] = useState<string | null>(null);
  const [has, setHas] = useState<{ exam: boolean; assignment: boolean }>({ exam: false, assignment: false });
  const [openKind, setOpenKind] = useState<ExamKind | null>(null);
  const [deepReview, setDeepReview] = useState(false);
  const [submitted, setSubmitted] = useState<{ exam: boolean; assignment: boolean }>({ exam: false, assignment: false });

  useEffect(() => {
    let alive = true;
    setHas({ exam: false, assignment: false });
    setSubmitted({ exam: false, assignment: false });
    setVideoId(null);
    void videoIdBySlug(slug, idx)
      .then(async (id) => {
        if (!alive || !id) return;
        setVideoId(id);
        const [resExam, resAssign] = await Promise.all([
          getMyResult(id, "exam").catch(() => null),
          getMyResult(id, "assignment").catch(() => null),
        ]);
        if (!alive) return;
        setSubmitted({ exam: resExam?.result != null, assignment: resAssign?.result != null });
        setHas({
          exam: !!resExam?.questions?.questions?.length,
          assignment: !!resAssign?.questions?.questions?.length,
        });
      })
      .catch(() => {
        /* offline — no exam chips */
      });
    return () => {
      alive = false;
    };
  }, [slug, idx]);

  const closeModal = () => {
    setOpenKind(null);
    setDeepReview(false);
    if (!videoId) return;
    void Promise.all([
      getMyResult(videoId, "exam").catch(() => null),
      getMyResult(videoId, "assignment").catch(() => null),
    ]).then(([resExam, resAssign]) => {
      setSubmitted({ exam: resExam?.result != null, assignment: resAssign?.result != null });
    });
  };

  if (!has.exam && !has.assignment) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {has.exam &&
          (submitted.exam ? (
            <Button
              title={x.reviewBtn}
              variant="secondary"
              onPress={() => {
                setOpenKind("exam");
                setDeepReview(true);
              }}
            />
          ) : (
            <Button
              title={x.takeExam}
              variant="primary"
              onPress={() => {
                setOpenKind("exam");
                setDeepReview(false);
              }}
            />
          ))}
        {has.assignment &&
          (submitted.assignment ? (
            <Button
              title={x.reviewBtn}
              variant="secondary"
              onPress={() => {
                setOpenKind("assignment");
                setDeepReview(true);
              }}
            />
          ) : (
            <Button
              title={x.takeAssign}
              variant="secondary"
              onPress={() => {
                setOpenKind("assignment");
                setDeepReview(false);
              }}
            />
          ))}
      </View>
      {openKind && videoId && (
        <ExamTake videoId={videoId} kind={openKind} startInReview={deepReview} onClose={closeModal} />
      )}
    </View>
  );
}

function LessonRow({
  m,
  i,
  mins,
  idx,
  open,
  setOpen,
  go,
  minLabel,
  canOpen,
  st,
}: {
  m: Module;
  i: number;
  mins: number;
  idx: number;
  open: number | null;
  setOpen: (v: number | null) => void;
  go: (i: number) => void;
  minLabel: string;
  canOpen: boolean;
  st: "current" | "done" | "locked" | "todo";
}) {
  const isOpen = open === i;
  return (
    <View style={styles.lessonRow}>
      <Pressable
        disabled={!canOpen}
        onPress={() => {
          if (isOpen) setOpen(null);
          else {
            setOpen(i);
            if (i !== idx) go(i);
          }
        }}
        style={styles.lessonBtn}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <StatusIcon state={st} />
        <View style={{ flexShrink: 1, flex: 1 }}>
          <Txt variant="small" numberOfLines={1} style={{ fontWeight: "700", color: i === idx ? palette.accent : palette.fg }}>
            {m.t}
          </Txt>
          <Txt variant="meta" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
            {mins} {minLabel}
          </Txt>
        </View>
        <Txt variant="meta" tone="muted">
          {isOpen ? "▾" : "▸"}
        </Txt>
      </Pressable>
      {isOpen && canOpen && (
        <Txt variant="meta" tone="muted" style={styles.lessonDesc}>
          {m.d}
        </Txt>
      )}
    </View>
  );
}

export default function WatchPage() {
  const { slug, video } = useLocalSearchParams<{ slug: string; video: string }>();
  const { t, lang } = useLang();
  const w = t.watch;
  const { user, signOut } = useAuth();
  const [course, setCourse] = useState<Awaited<ReturnType<typeof getCourse>> | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [plays, setPlays] = useState(0);
  const [, setDoneTick] = useState(0);
  const counted = useRef(false);
  const [realDur, setRealDur] = useState(0);
  const minsSavedRef = useRef(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [playErr, setPlayErr] = useState<PlayDenied | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const [sessionDead, setSessionDead] = useState(false);
  const watchAcc = useRef({ last: 0, total: 0 });
  const [mins, setMins] = useState(10);

  const slugStr = String(slug ?? "");
  const videoNum = Math.max(0, parseInt(String(video ?? "0"), 10) || 0);

  const enrolled = !!user && !user.banned && (user.enrolled.includes(slugStr) || user.role === "admin");

  useEffect(() => {
    if (!user) {
      router.replace("/sign-in" as never);
      return;
    }
    void ensureWatchCache();
  }, [user]);

  // Course detail (modules list).
  useEffect(() => {
    let alive = true;
    setCourse(null);
    void getCourse(slugStr, lang)
      .then((c) => alive && setCourse(c))
      .catch(() => alive && setCourse(null));
    return () => {
      alive = false;
    };
  }, [slugStr, lang]);

  const total = course?.modules.length ?? 0;
  const idx = Math.min(Math.max(0, videoNum), Math.max(0, total - 1));
  const mod = course?.modules[idx] ?? { t: "", d: "" };

  // Server truth wins on page open; mirrors rows into the local layer.
  const refreshSeq = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchedRef = useRef("");
  const refreshServerCounts = useCallback(
    (targetIdx: number) => {
      if (!user || !course) return;
      const my = ++refreshSeq.current;
      setRefreshing(true);
      void getWatchState(slugStr, lang)
        .then((rows) => {
          if (my !== refreshSeq.current) return;
          replaceProgress(
            user,
            slugStr,
            rows.map((r) => ({ idx: r.sort_order, views: r.views_count, done: r.done, unlocked: r.unlocked })),
          );
          const cur = rows.find((r) => r.sort_order === targetIdx);
          setPlays(cur ? cur.views_count : 0);
          setDoneTick((n) => n + 1);
          if (cur && cur.unlocked) {
            const key = `${slugStr}:${targetIdx}`;
            if (touchedRef.current !== key) {
              touchedRef.current = key;
              if (cur.video_id) void touchUnlocked(cur.video_id).catch(() => {});
            }
          }
        })
        .catch(() => {
          /* offline — local counts stay */
        })
        .finally(() => {
          if (my === refreshSeq.current) setRefreshing(false);
        });
    },
    [user, course, slugStr, lang],
  );

  useEffect(() => {
    if (!user || !course) return;
    counted.current = false;
    minsSavedRef.current = false;
    watchAcc.current = { last: 0, total: 0 };
    setRealDur(0);
    setPlayErr(null);
    setPlayKey(0);
    setSessionDead(false);
    setVideoId(null);
    setResolving(true);
    setMins(10);
    setPlays(user ? getViews(user, slugStr, idx) : 0);
    setOpen(idx);
    void videoIdBySlug(slugStr, idx)
      .then((id) => {
        setVideoId(id);
        setResolving(false);
      })
      .catch(() => setResolving(false));
    refreshServerCounts(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugStr, videoNum, lang, user?.email, course?.slug]);

  const left = Math.max(0, MAX_VIEWS - plays);
  const unlocked = user ? isUnlocked(user, slugStr, idx) : false;

  const onProgress = (seconds: number) => {
    // accumulate only contiguous playback — jumps >2s are seeks, never watched
    const acc = watchAcc.current;
    const delta = seconds - acc.last;
    if (delta >= 0 && delta < 2) acc.total += delta;
    acc.last = seconds;
    if (!user || counted.current || seconds < 3 || left <= 0) return;
    counted.current = true;
    unlockNextOnStart(user, slugStr, idx);
    refreshServerCounts(idx);
  };

  const onDuration = (seconds: number) => {
    setRealDur((prev) => (prev > 0 ? prev : seconds));
    if (!minsSavedRef.current && Number.isFinite(seconds) && seconds > 0) {
      minsSavedRef.current = true;
      const real = Math.max(1, Math.ceil(seconds / 60));
      if (real !== (mins || 10)) {
        setMins(real);
        void videoIdBySlug(slugStr, idx)
          .then((v) => {
            if (!v) return;
            return reportVideoMins(v, real);
          })
          .catch(() => {
            /* pre-migration DB or offline — local value stays */
          });
      }
    }
  };

  const onEnded = () => {
    if (!user) return;
    if (recordDone(user, slugStr, idx, watchAcc.current.total, realDur, mins, true)) {
      setDoneTick((n) => n + 1);
    }
  };

  const go = (i: number) => {
    router.push(`/watch/${slugStr}/${i}` as never);
  };

  if (!user) return null;

  if (!enrolled) {
    return (
      <View style={styles.root}>
        <View style={styles.panel}>
          <Txt variant="h3">{w.noAccessT}</Txt>
          <Txt variant="small" tone="muted" style={{ marginTop: 4, textAlign: "center" }}>
            {w.noAccessD}
          </Txt>
          <Button title={w.retryBtn} variant="secondary" onPress={() => router.replace("/dashboard" as never)} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.root}>
        <View style={styles.panel}>
          <Txt variant="h3">{w.noCourseT}</Txt>
          <Txt variant="small" tone="muted" style={{ marginTop: 4, textAlign: "center" }}>
            {w.noCourseD}
          </Txt>
          <Button title={w.backToCourse} variant="secondary" onPress={() => router.push("/courses" as never)} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => router.push(`/course/${slugStr}` as never)}>
            <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
              {w.backToCourse}
            </Txt>
          </Pressable>
          <View style={[styles.panel, { marginTop: 20 }]}>
            <Txt variant="h3">{w.emptyT}</Txt>
            <Txt variant="small" tone="muted" style={{ marginTop: 4, textAlign: "center" }}>
              {w.emptyD}
            </Txt>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.push(`/course/${slugStr}` as never)}>
          <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
            {w.backToCourse}
          </Txt>
        </Pressable>

        <View style={{ marginTop: 24 }}>
          <Txt variant="h2" style={{ fontSize: 26 }}>
            {mod.t}
          </Txt>
          <Txt variant="body" tone="muted" style={{ marginTop: 8 }}>
            {mod.d}
          </Txt>

          <View style={{ marginTop: 20 }}>
            {sessionDead ? (
              <View style={[styles.panel, { marginTop: 0 }]}>
                <Txt variant="h3">تم تسجيل الدخول من جهاز آخر</Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
                  Signed in on another device. This device has been signed out.
                </Txt>
                <Button
                  title={lang === "ar" ? "تسجيل الدخول" : "Sign in"}
                  variant="primary"
                  onPress={() => {
                    void signOut().finally(() => router.replace("/sign-in" as never));
                  }}
                  style={{ marginTop: 20 }}
                />
              </View>
            ) : playErr ? (
              <View style={[styles.panel, { marginTop: 0 }]}>
                <Txt variant="h3">{playErr.ar !== "" ? playErr.ar : playErr.en !== "" ? playErr.en : w.refreshFail}</Txt>
                {playErr.ar !== "" && playErr.en !== "" && playErr.ar !== playErr.en && (
                  <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
                    {playErr.en}
                  </Txt>
                )}
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 20 }}>
                  <Button
                    title={refreshing ? "…" : w.retryBtn}
                    variant="secondary"
                    disabled={refreshing}
                    onPress={() => {
                      setPlayErr(null);
                      setPlayKey((k) => k + 1);
                      refreshServerCounts(idx);
                    }}
                  />
                  <Button title="WhatsApp" variant="primary" onPress={() => void Linking.openURL(WA).catch(() => {})} />
                </View>
              </View>
            ) : !unlocked ? (
              <View style={[styles.panel, { marginTop: 0, backgroundColor: palette.surface }]}>
                <Txt variant="h3">{w.lockedT}</Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 4, textAlign: "center" }}>
                  {w.lockedD}
                </Txt>
              </View>
            ) : left <= 0 ? (
              <View style={[styles.panel, { marginTop: 0 }]}>
                <Txt variant="h3">{w.limitT}</Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 4, textAlign: "center" }}>
                  {w.limitD}
                </Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 20 }}>
                  <Button
                    title={refreshing ? "…" : w.retryBtn}
                    variant="secondary"
                    disabled={refreshing}
                    onPress={() => refreshServerCounts(idx)}
                  />
                  <Button title="WhatsApp" variant="primary" onPress={() => void Linking.openURL(WA).catch(() => {})} />
                </View>
              </View>
            ) : resolving ? (
              <View style={[styles.playerBox, { backgroundColor: palette.surface }]} />
            ) : !videoId ? (
              <View style={[styles.panel, { marginTop: 0 }]}>
                <Txt variant="h4">No video attached yet</Txt>
                <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
                  Send the video file to attach it here.
                </Txt>
              </View>
            ) : (
              <ProtectedPlayer
                key={`${videoId}:${playKey}`}
                videoId={videoId}
                onProgress={onProgress}
                onSeeked={(s) => {
                  watchAcc.current.last = s;
                }}
                onDuration={onDuration}
                onEnded={onEnded}
                onDenied={setPlayErr}
                onSessionDead={() => setSessionDead(true)}
              />
            )}
          </View>

          {unlocked && (
            <View style={styles.remainingChip}>
              <Txt style={{ color: left > 0 ? palette.deep : palette.muted, fontSize: 13, fontWeight: "700" }}>
                {w.remaining.replace("{n}", String(left))}
              </Txt>
            </View>
          )}

          <LessonExams slug={slugStr} idx={idx} />
        </View>

        {/* course content — always visible on phone (web lg:hidden panel) */}
        <View style={styles.contentPanel}>
          <Txt variant="small" style={[styles.contentHead, { fontWeight: "700" }]}>
            {w.contentT} · {course.modules[idx]?.t}
          </Txt>
          <View style={{ paddingTop: 4 }}>
            {course.modules.map((m, i) => {
              const st = !isUnlocked(user, slugStr, i)
                ? "locked"
                : isDone(user, slugStr, i)
                  ? i === idx
                    ? "current"
                    : "done"
                  : i === idx
                    ? "current"
                    : "todo";
              return (
                <LessonRow
                  key={`${m.t}-${i}`}
                  m={m}
                  i={i}
                  mins={mins && i === idx ? mins : 10}
                  idx={idx}
                  open={open}
                  setOpen={setOpen}
                  go={go}
                  minLabel={w.min}
                  canOpen={isUnlocked(user, slugStr, i)}
                  st={st}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  content: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 48 },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  playerBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 20,
  },
  remainingChip: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: "rgba(59,188,217,0.16)",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  contentPanel: {
    marginTop: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 12,
  },
  contentHead: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: palette.fg,
  },
  lessonRow: { borderRadius: 12, overflow: "hidden" },
  lessonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  lessonDesc: { paddingHorizontal: 12, paddingBottom: 12, paddingLeft: 40, lineHeight: 19 },
});
