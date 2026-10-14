import { Fragment, useEffect, useRef, useState } from "react";
import { getCourse, getVideos, useContent, type VideoView } from "../store";
import { ProtectedVideoPlayer, type PlayDenied } from "../components/ProtectedVideoPlayer";
import { ExamTake } from "../components/ExamTake";
import type { ExamKind } from "../lib/db/examsDb";
import type { KtUser } from "../auth";
import { useLang } from "../components/lang";
import { isSupabaseConfigured } from "../lib/db/env";
import {
  MAX_VIEWS,
  getViews,
  isDone,
  isUnlocked,
  recordDone,
  replaceProgress,
  setUnlockedFlag,
} from "../watch";

const WA = "https://wa.me/201042031062";

function StatusIcon({ state }: { state: "current" | "done" | "locked" | "todo" }) {
  if (state === "locked")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4 flex-none" style={{ color: "var(--muted)" }}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  if (state === "done")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--kt-teal)" strokeWidth="2.6" aria-hidden="true" className="h-4 w-4 flex-none">
        <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4 flex-none" style={{ color: state === "current" ? "var(--accent)" : "var(--muted)" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LessonRow({
  m,
  i,
  videos,
  user,
  slug,
  idx,
  open,
  setOpen,
  go,
  minLabel,
}: {
  m: { t: string; d: string };
  i: number;
  videos: VideoView[];
  user: KtUser;
  slug: string;
  idx: number;
  open: number | null;
  setOpen: (v: number | null) => void;
  go: (i: number) => void;
  minLabel: string;
}) {
  // Started (views>0) is NOT done — done requires a full genuine watch.
  const st = !isUnlocked(user, slug, i)
    ? "locked"
    : isDone(user, slug, i)
      ? i === idx ? "current" : "done"
      : i === idx ? "current" : "todo";
  const isOpen = open === i;
  const canOpen = isUnlocked(user, slug, i);
  return (
    <div className="overflow-hidden rounded-xl">
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => {
          if (isOpen) {
            setOpen(null);
          } else {
            setOpen(i);
            if (i !== idx) go(i);
          }
        }}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-start text-sm"
        style={!canOpen ? { opacity: 0.65 } : undefined}
      >
        <StatusIcon state={st} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold" style={i === idx ? { color: "var(--accent)" } : undefined}>
            {m.t}
          </span>
          <span className="mt-0.5 block text-xs" dir="ltr" style={{ color: "var(--muted)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
            {videos[i]?.mins ?? 10} {minLabel}
          </span>
        </span>
      </button>
      {isOpen && canOpen && (
        <p className="px-3 pb-3 ps-9 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {m.d}
        </p>
      )}
    </div>
  );
}

function ContentList({
  modules,
  sections,
  videos,
  user,
  slug,
  idx,
  open,
  setOpen,
  go,
  minLabel,
}: {
  modules: { t: string; d: string }[];
  sections: string[];
  videos: VideoView[];
  user: KtUser;
  slug: string;
  idx: number;
  open: number | null;
  setOpen: (v: number | null) => void;
  go: (i: number) => void;
  minLabel: string;
}) {
  // Consecutive lessons sharing a section header ("Month 1"…) collapse
  // under it; empty section renders flat. Only the current lesson's
  // section starts open — no sidebar traffic.
  type Block = { key: string; title: string | null; items: number[] };
  const blocks: Block[] = [];
  modules.forEach((_, i) => {
    const sec = (sections[i] ?? "").trim();
    const last = blocks[blocks.length - 1];
    if (sec !== "" && last && last.title === sec) {
      last.items.push(i);
    } else if (sec !== "") {
      blocks.push({ key: `sec-${sec}-${i}`, title: sec, items: [i] });
    } else if (last && last.title === null) {
      last.items.push(i);
    } else {
      blocks.push({ key: `flat-${i}`, title: null, items: [i] });
    }
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const b of blocks) {
      if (b.title !== null) init[b.key] = !b.items.includes(idx);
    }
    setCollapsed(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const rowProps = { videos, user, slug, idx, open, setOpen, go, minLabel };
  return (
    <>
      {blocks.map((b) =>
        b.title === null ? (
          <Fragment key={b.key}>
            {b.items.map((i) => (
              <LessonRow key={`${modules[i]?.t}-${i}`} m={modules[i]} i={i} {...rowProps} />
            ))}
          </Fragment>
        ) : (
          <div key={b.key} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--kt-line)" }}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [b.key]: !(c[b.key] ?? true) }))}
              aria-expanded={!(collapsed[b.key] ?? true)}
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-start text-sm font-bold"
              style={{ fontFamily: "var(--font-display)", background: "var(--surface)" }}
            >
              <span className="truncate">{b.title}</span>
              <span aria-hidden="true" style={{ color: "var(--muted)" }}>
                {collapsed[b.key] ?? true ? "▸" : "▾"}
              </span>
            </button>
            {!(collapsed[b.key] ?? true) && (
              <div className="grid gap-1 p-1.5">
                {b.items.map((i) => (
                  <LessonRow key={`${modules[i]?.t}-${i}`} m={modules[i]} i={i} {...rowProps} />
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </>
  );
}

/** Real exams/assignments attached to the lesson (structured content). */
function LessonExams({ slug, idx }: { slug: string; idx: number }) {
  const { t } = useLang();
  const x = t.exam;
  const [videoId, setVideoId] = useState<string | null>(null);
  const [has, setHas] = useState<{ exam: boolean; assignment: boolean }>({ exam: false, assignment: false });
  const [openKind, setOpenKind] = useState<ExamKind | null>(null);
  const [deepReview, setDeepReview] = useState(false);
  // Attempt already submitted → the button flips to Review (opens the modal
  // straight in review mode). Refreshed when the modal closes (new submit).
  const [submitted, setSubmitted] = useState<{ exam: boolean; assignment: boolean }>({ exam: false, assignment: false });

  // Deep link: dashboard Review buttons land here and open the exam modal
  // directly (in review mode for graded attempts) — no extra clicks.
  const consumeDeepLink = () => {
    try {
      const raw = window.sessionStorage.getItem("kt-open-exam");
      if (!raw) return null;
      const want = JSON.parse(raw) as { slug?: string; idx?: number; kind?: ExamKind };
      if (want && want.slug === slug && want.idx === idx && (want.kind === "exam" || want.kind === "assignment")) {
        window.sessionStorage.removeItem("kt-open-exam");
        return want.kind;
      }
    } catch {
      /* ignore malformed flag */
    }
    return null;
  };

  useEffect(() => {
    let alive = true;
    setVideoId(null);
    setHas({ exam: false, assignment: false });
    setOpenKind(null);
    setDeepReview(false);
    setSubmitted({ exam: false, assignment: false });
    if (!isSupabaseConfigured()) return;
    void import("../lib/db/examsDb").then(async (m) => {
      try {
        const id = await m.videoIdBySlug(slug, idx);
        if (!alive || !id) return;
        const [exam, assign, resExam, resAssign] = await Promise.all([
          m.getExam(id, "exam").catch(() => null),
          m.getExam(id, "assignment").catch(() => null),
          m.getMyResult(id, "exam").catch(() => null),
          m.getMyResult(id, "assignment").catch(() => null),
        ]);
        if (!alive) return;
        setVideoId(id);
        setHas({ exam: exam !== null, assignment: assign !== null });
        setSubmitted({ exam: resExam?.result !== null, assignment: resAssign?.result !== null });
        const deep = consumeDeepLink();
        if (deep && (deep === "exam" ? exam : assign)) {
          setOpenKind(deep);
          setDeepReview(true);
        }
      } catch {
        /* no structured exams — links section covers the rest */
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, idx]);

  const open = (kind: ExamKind, review: boolean) => {
    if (!videoId) return;
    setOpenKind(kind);
    setDeepReview(review);
  };

  const closeModal = () => {
    // Re-check server state: a fresh submit flips Take → Review instantly.
    setOpenKind(null);
    setDeepReview(false);
    if (!videoId || !isSupabaseConfigured()) return;
    void import("../lib/db/examsDb")
      .then(async (m) => {
        const [resExam, resAssign] = await Promise.all([
          m.getMyResult(videoId, "exam").catch(() => null),
          m.getMyResult(videoId, "assignment").catch(() => null),
        ]);
        setSubmitted({ exam: resExam?.result != null, assignment: resAssign?.result != null });
      })
      .catch(() => {
        /* keep previous labels */
      });
  };

  if (!has.exam && !has.assignment) return null;
  return (
    <div className="mt-6">
      <div className="mt-3 flex flex-wrap gap-3">
        {has.exam && (
          submitted.exam ? (
            <button type="button" onClick={() => void open("exam", true)} className="btn btn-secondary" style={{ minHeight: 44 }}>
              {x.reviewBtn}
            </button>
          ) : (
            <button type="button" onClick={() => void open("exam", false)} className="btn btn-primary" style={{ minHeight: 44 }}>
              {x.takeExam}
            </button>
          )
        )}
        {has.assignment && (
          submitted.assignment ? (
            <button type="button" onClick={() => void open("assignment", true)} className="btn btn-secondary" style={{ minHeight: 44 }}>
              {x.reviewBtn}
            </button>
          ) : (
            <button type="button" onClick={() => void open("assignment", false)} className="btn btn-secondary" style={{ minHeight: 44 }}>
              {x.takeAssign}
            </button>
          )
        )}
      </div>
      {openKind && videoId && (
        <ExamTake videoId={videoId} kind={openKind} startInReview={deepReview} onClose={closeModal} />
      )}
    </div>
  );
}

export function Watch({  slug,
  video,
  user,
  ready,
}: {
  slug: string;
  video: number;
  user: KtUser | null;
  ready?: boolean;
}) {
  const { lang, t } = useLang();
  const w = t.watch;
  useContent();
  const course = getCourse(lang, slug);
  const videos: VideoView[] = getVideos(slug);
  const [open, setOpen] = useState<number | null>(null);
  const [plays, setPlays] = useState(0);
  const [, setDoneTick] = useState(0);
  const counted = useRef(false);
  // Real media duration (not the nominal minutes label) drives completion.
  const [realDur, setRealDur] = useState(0);
  // Minutes self-heal: first real duration per lesson corrects videos.mins
  // locally + server-side, so the stored value is measured, never typed.
  const minsSavedRef = useRef(false);
  // Playback grant: resolved video row id (player fetches its URL itself),
  // plus terminal play states surfaced by the player.
  const [videoId, setVideoId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [playErr, setPlayErr] = useState<PlayDenied | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const [sessionDead, setSessionDead] = useState(false);
  // Continuous-watch accumulator: only contiguous playback counts toward
  // completion. Seek jumps reset continuity, so scrubbing to the end grants
  // nothing (server re-validates against DB-side minutes).
  const watchAcc = useRef({ last: 0, total: 0 });

  // Granted enrollment (or admin testing) unlocks content. Server RPCs
  // re-enforce sign-in + caps independently — this gate is UX only.
  const enrolled = !!user && !user.banned && (user.enrolled.includes(slug) || user.role === "admin");

  useEffect(() => {
    if (ready && !user) {
      window.location.href = "signin.html";
      return;
    }
    if (user?.banned) window.location.hash = "#/dashboard";
  }, [user, ready]);

  // Monotonic guard must reset per video: Math.max against the PREVIOUS
  // lesson's count leaked "limit reached" onto unopened lessons.
  const videoRef = useRef(video);
  useEffect(() => {
    counted.current = false;
    minsSavedRef.current = false;
    watchAcc.current = { last: 0, total: 0 };
    setRealDur(0);
    setPlayErr(null);
    setPlayKey(0);
    setSessionDead(false);
    setVideoId(null);
    setResolving(true);
    if (!course || !isSupabaseConfigured()) {
      setResolving(false);
      return;
    }
    // Resolve the DB row id for this position (player fetches its own URL).
    const total = course.modules.length;
    const at = Math.min(Math.max(0, video), Math.max(0, total - 1));
    if (user && course) {
      if (videoRef.current !== video) {
        videoRef.current = video;
        setPlays(getViews(user, slug, video));
      } else {
        // same video remount (fullscreen transitions, HMR): never lower
        setPlays((p) => Math.max(p, getViews(user, slug, video)));
      }
    }
    setOpen(video);
    window.scrollTo(0, 0);
    let alive = true;
    void import("../lib/db/examsDb")
      .then((m) => m.videoIdBySlug(course.slug, at))
      .then((id) => {
        if (alive) {
          setVideoId(id);
          setResolving(false);
        }
      })
      .catch(() => {
        if (alive) setResolving(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, video]);

  // Server truth wins on page open: an admin restart (or another device)
  // only reaches this browser by re-reading — local cache alone would show
  // stale burned-out counts forever. refreshKey lets the limit screen retry.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Parts touched (sticky-unlock persisted) this session — no repeat calls.
  const touchedRef = useRef<string>("");
  // Latest fetch wins: a slow answer for a previous lesson must never
  // overwrite the current one (the old alive-flag, race-safe).
  const refreshSeq = useRef(0);
  // Single source of counts: re-read server rows and mirror them locally.
  // Called on mount AND once real playback starts (the grant may have burned
  // a view our mount snapshot predates). Never invents counts client-side —
  // local +1 estimates overshot the server (repeat window) and oscillated.
  const refreshServerCounts = (targetIdx: number) => {
    if (!isSupabaseConfigured() || !user || !course) return;
    const my = ++refreshSeq.current;
    setRefreshing(true);
    void import("../lib/db/watchDb")
      .then((m) => m.getWatchStateDb(slug, lang))
      .then((rows) => {
        if (my !== refreshSeq.current) return;
        replaceProgress(
          user,
          slug,
          rows.map((r) => ({ idx: r.sort_order, views: r.views_count, done: r.done, unlocked: r.unlocked })),
        );
        const cur = rows.find((r) => r.sort_order === targetIdx);
        setPlays(cur ? cur.views_count : 0);
        setDoneTick((n) => n + 1);
        // Persist the open state: an opened-while-entitled part stays open
        // even if an admin later restarts a DIFFERENT part. Burns no views.
        if (cur && cur.unlocked) {
          const key = `${slug}:${targetIdx}`;
          if (touchedRef.current !== key) {
            touchedRef.current = key;
            void import("../lib/db/watchDb")
              .then((w) => (cur.video_id ? w.touchUnlockedDb(cur.video_id) : Promise.resolve()))
              .catch(() => {
                /* unlocked display already correct; server sync retries later */
              });
          }
        }
      })
      .catch(() => {
        /* offline — local counts stay */
      })
      .finally(() => {
        if (my === refreshSeq.current) setRefreshing(false);
      });
  };
  useEffect(() => {
    if (!isSupabaseConfigured() || !user || !course) {
      setRefreshing(false);
      return;
    }
    refreshServerCounts(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, video, lang, user?.email, refreshKey]);

  if (!user || !enrolled) return null;

  // Missing course or zero lessons must NEVER white-screen: friendly panels.
  if (!course) {
    return (
      <main id="content" className="section">
        <div className="kt-wrap">
          <div className="rounded-[20px] border p-8 text-center" style={{ borderColor: "var(--kt-line)" }}>
            <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{w.noCourseT}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{w.noCourseD}</p>
            <a href="#/courses" className="btn btn-secondary mt-5">{w.backToCourse}</a>
          </div>
        </div>
      </main>
    );
  }
  const total = course.modules.length;
  if (total === 0) {
    return (
      <main id="content" className="section">
        <div className="kt-wrap">
          <a href={`#/courses/${slug}`} className="text-sm font-bold" style={{ color: "var(--accent)" }}>
            {w.backToCourse}
          </a>
          <div className="mt-5 rounded-[20px] border p-8 text-center" style={{ borderColor: "var(--kt-line)" }}>
            <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{w.emptyT}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{w.emptyD}</p>
          </div>
        </div>
      </main>
    );
  }

  const idx = Math.min(Math.max(0, video), total - 1);
  const mod = course.modules[idx] ?? { t: "", d: "" };
  const vid = videos[idx] ?? { src: "", mins: 10, assign: "", exam: "" };
  const left = Math.max(0, MAX_VIEWS - plays);
  const unlocked = isUnlocked(user, slug, idx);
  const links = [
    vid.assign ? { label: w.assignL, href: vid.assign } : null,
    vid.exam ? { label: w.examL, href: vid.exam } : null,
  ].filter((x): x is { label: string; href: string } => x !== null);

  const onProgress = (seconds: number) => {
    // accumulate only contiguous playback — jumps >2s are seeks, never watched
    const acc = watchAcc.current;
    const delta = seconds - acc.last;
    if (delta >= 0 && delta < 2) acc.total += delta;
    acc.last = seconds;
    // Count display follows the SERVER only: the grant may already have
    // burned this view at mount (or the repeat window spared it) — a local
    // +1 here overshot and oscillated on every remount. Mirror the unlock
    // instantly, then re-read the authoritative count once per playback.
    if (counted.current || seconds < 3 || left <= 0) return;
    counted.current = true;
    setUnlockedFlag(user, slug, idx);
    refreshServerCounts(idx);
  };

  const onPlayDenied = (e: PlayDenied) => {
    setPlayErr(e);
  };

  const onSessionDead = () => {
    setSessionDead(true);
  };

  const signOutToLogin = () => {
    void import("../auth")
      .then((m) => m.signOutEverywhere())
      .catch(() => {})
      .finally(() => {
        window.location.href = "signin.html";
      });
  };

  const onSeeked = (seconds: number) => {
    watchAcc.current.last = seconds;
  };

  const onDuration = (seconds: number) => {
    setRealDur((prev) => (prev > 0 ? prev : seconds));
    // First real duration: heal the stored minutes (measured, not typed).
    if (!minsSavedRef.current && Number.isFinite(seconds) && seconds > 0) {
      minsSavedRef.current = true;
      const real = Math.max(1, Math.ceil(seconds / 60));
      if (real !== (vid.mins || 10)) {
        void import("../store").then((s) => s.setVideoMins(slug, idx, real));
        void import("../lib/db/examsDb")
          .then((m) => m.videoIdBySlug(slug, idx))
          .then((v) => {
            if (!v) return;
            return import("../lib/db/watchDb").then((w) => w.reportVideoMins(v, real));
          })
          .catch(() => {
            /* pre-migration DB or offline — local value stays */
          });
      }
    }
  };

  const onEnded = () => {
    // Ended playback completes outright — seek-to-end included, by decision.
    // The next part opens; watching honestly remains the student's choice.
    if (recordDone(user, slug, idx, watchAcc.current.total, realDur, vid.mins, true)) {
      setDoneTick((n) => n + 1);
    }
  };

  const go = (i: number) => {
    window.location.hash = `#/courses/${slug}/watch/${i}`;
  };

  return (
    <main id="content" className="section">
      <div className="kt-wrap">
        <a
          href={`#/courses/${slug}`}
          className="text-sm font-bold"
          style={{ color: "var(--accent)" }}
        >
          {w.backToCourse}
        </a>

        <div className="mt-6 grid items-start gap-10 lg:grid-cols-[1fr_320px]">
          {/* MAIN */}
          <div className="min-w-0">
            <h1
              className="text-2xl font-bold md:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {mod.t}
            </h1>
            <p className="mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
              {mod.d}
            </p>

            <div className="mt-5">
              {sessionDead ? (
                <div
                  className="rounded-[20px] border p-8 text-center"
                  style={{ borderColor: "var(--kt-line)" }}
                  role="alert"
                >
                  <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    تم تسجيل الدخول من جهاز آخر
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }} dir="ltr">
                    Signed in on another device. This device has been signed out.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button type="button" onClick={signOutToLogin} className="btn btn-primary">
                      {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
                    </button>
                  </div>
                </div>
              ) : playErr ? (
                <div
                  className="rounded-[20px] border p-8 text-center"
                  style={{ borderColor: "var(--kt-line)" }}
                  role="alert"
                >
                  <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {playErr.ar !== "" ? playErr.ar : playErr.en !== "" ? playErr.en : w.refreshFail}
                  </p>
                  {playErr.ar !== "" && playErr.en !== "" && playErr.ar !== playErr.en && (
                    <p className="mt-1 text-sm" dir="ltr" style={{ color: "var(--muted)" }}>
                      {playErr.en}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPlayErr(null);
                        setPlayKey((k) => k + 1);
                        setRefreshKey((k) => k + 1);
                      }}
                      disabled={refreshing}
                      className="btn btn-secondary disabled:opacity-60"
                    >
                      {refreshing ? "…" : w.retryBtn}
                    </button>
                    <a href={WA} className="btn btn-primary">
                      WhatsApp
                    </a>
                  </div>
                </div>
              ) : !unlocked ? (
                <div
                  className="rounded-[20px] p-8 text-center"
                  style={{ background: "var(--surface)" }}
                >
                  <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {w.lockedT}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {w.lockedD}
                  </p>
                </div>
              ) : left <= 0 ? (
                <div
                  className="rounded-[20px] border p-8 text-center"
                  style={{ borderColor: "var(--kt-line)" }}
                >
                  <p className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {w.limitT}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {w.limitD}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRefreshKey((k) => k + 1)}
                      disabled={refreshing}
                      className="btn btn-secondary disabled:opacity-60"
                    >
                      {refreshing ? "…" : w.retryBtn}
                    </button>
                    <a href={WA} className="btn btn-primary">
                      WhatsApp
                    </a>
                  </div>
                </div>
              ) : resolving ? (
                <div
                  className="grid aspect-video w-full animate-pulse place-items-center rounded-[20px]"
                  style={{ background: "var(--surface)" }}
                  aria-label="loading"
                />
              ) : !videoId ? (
                <div
                  className="rounded-[20px] border p-8 text-center"
                  style={{ borderColor: "var(--kt-line)" }}
                >
                  <p className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    No video attached yet
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    Send the video file to attach it here.
                  </p>
                </div>
              ) : (
                <ProtectedVideoPlayer
                  key={`${videoId}:${playKey}`}
                  videoId={videoId}
                  onProgress={onProgress}
                  onSeeked={onSeeked}
                  onDuration={onDuration}
                  onEnded={onEnded}
                  onDenied={onPlayDenied}
                  onSessionDead={onSessionDead}
                />
              )}
            </div>

            {unlocked && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-bold" style={{
                background: left > 0 ? "var(--teal-soft)" : "var(--surface)",
                color: left > 0 ? "var(--kt-deep)" : "var(--muted)",
                fontFamily: "var(--font-display)",
              }}>
                {w.remaining.replace("{n}", String(left))}
              </p>
            )}

            <LessonExams slug={slug} idx={idx} />
            {links.length > 0 && (
              <div className="mt-6">
                <h2 className="font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  {w.resourcesT}
                </h2>
                <div className="mt-3 flex flex-wrap gap-3">
                  {links.map((r) => {
                    const external = /^(https?:|data:|blob:)/.test(r.href);
                    return (
                      <a
                        key={r.label}
                        href={r.href}
                        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="btn btn-secondary"
                        style={{ minHeight: 44 }}
                      >
                        {r.label} →
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* MOBILE — course content always visible, no collapsing */}
          <div className="rounded-[20px] border bg-white p-3 lg:hidden" style={{ borderColor: "var(--kt-line)" }}>
            <p className="flex items-center gap-3 px-2 py-2 text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
              <span className="flex-1">{w.contentT} · {course.modules[idx]?.t}</span>
            </p>
            <div className="pt-1">
              <ContentList
                modules={course.modules}
                sections={course.sections}
                videos={videos}
                user={user}
                slug={slug}
                idx={idx}
                open={open}
                setOpen={setOpen}
                go={go}
                minLabel={w.min}
              />
            </div>
          </div>

          {/* DESKTOP SIDEBAR — grid order flips it LTR/RTL automatically */}
          <aside
            className="hidden rounded-[20px] border bg-white p-3 lg:sticky lg:top-24 lg:block"
            style={{ borderColor: "var(--kt-line)" }}
            aria-label={w.contentT}
          >
            <p className="px-2 pb-2 pt-1 text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {w.contentT}
            </p>
            <ContentList
              modules={course.modules}
              sections={course.sections}
              videos={videos}
              user={user}
              slug={slug}
              idx={idx}
              open={open}
              setOpen={setOpen}
              go={go}
              minLabel={w.min}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
