import { useEffect, useRef, useState } from "react";
import { getCourse, getVideos, useContent, type VideoView } from "../store";
import { ProtectedVideoPlayer } from "../components/ProtectedVideoPlayer";
import { ExamTake } from "../components/ExamTake";
import { isYoutubeSource } from "../lib/videoGuard";
import type { ExamContent, ExamKind } from "../lib/db/examsDb";
import type { KtUser } from "../auth";
import { useLang } from "../components/lang";
import { isSupabaseConfigured } from "../lib/db/env";
import {
  MAX_VIEWS,
  getViews,
  isDone,
  isUnlocked,
  recordDone,
  recordPlay,
  replaceProgress,
} from "../watch";

const WA = "https://wa.me/201042031062";

/* Adapter-ready player: file sources resolve through a script-built
   blob/object URL (nothing static in the HTML to copy from view-source).
   A future { kind: "embed", embedUrl } source renders an iframe here. */
/* Anti-record watermark: verified identity floats over the video in every
   playback mode (page + container fullscreen). pointer-events-none so it
   never blocks controls; low opacity so it never blocks content. */
const WM_SPOTS = [
  { top: 12, insetInlineStart: 12 },
  { top: 12, insetInlineEnd: 12 },
  { bottom: 12, insetInlineStart: 12 },
  { bottom: 12, insetInlineEnd: 12 },
] as const;

function Watermark({ email, phone }: { email: string; phone: string }) {
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    setSpot(Math.floor(Math.random() * WM_SPOTS.length));
    const id = window.setInterval(
      () => setSpot((s) => (s + 1) % WM_SPOTS.length),
      18000,
    );
    return () => window.clearInterval(id);
  }, []);
  if (!email && !phone) return null;
  const pos = WM_SPOTS[spot % WM_SPOTS.length];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 max-w-[70%] truncate rounded-lg px-3 py-1.5 text-xs font-bold"
      dir="ltr"
      style={{
        ...pos,
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "var(--font-display)",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {[email, phone].filter(Boolean).join(" • ")}
    </div>
  );
}

function Player({
  src,
  email,
  phone,
  onProgress,
  onSeeked,
  onDuration,
  onEnded,
}: {
  src: string;
  email: string;
  phone: string;
  onProgress: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let obj: string | null = null;
    setBlobUrl(null);
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.blob();
      })
      .then((b) => {
        if (!alive) return;
        obj = URL.createObjectURL(b);
        setBlobUrl(obj);
      })
      .catch(() => {
        // cross-origin fetch blocked → fall back to direct src
        if (alive) setBlobUrl(src);
      });
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [src]);

  if (!blobUrl) {
    return (
      <div
        className="grid aspect-video w-full animate-pulse place-items-center rounded-[20px]"
        style={{ background: "var(--surface)" }}
        aria-label="loading"
      />
    );
  }
  return (
    <div
      ref={boxRef}
      className="relative overflow-hidden rounded-[20px] select-none"
      style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onDoubleClick={() => {
        // Container fullscreen (not video-only) keeps the watermark visible.
        const el = boxRef.current;
        if (!el) return;
        try {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void el.requestFullscreen();
        } catch {
          /* ignore */
        }
      }}
    >
      <video
        key={blobUrl}
        src={blobUrl}
        controls
        controlsList="nodownload noremoteplayback nofullscreen"
        disablePictureInPicture
        playsInline
        draggable={false}
        className="aspect-video w-full"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) onDuration(d);
        }}
        onTimeUpdate={(e) => onProgress(e.currentTarget.currentTime)}
        onSeeked={(e) => onSeeked(e.currentTarget.currentTime)}
        onEnded={onEnded}
      />
      <Watermark email={email} phone={phone} />
    </div>
  );
}

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

function ContentList({
  modules,
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
  videos: VideoView[];
  user: KtUser;
  slug: string;
  idx: number;
  open: number | null;
  setOpen: (v: number | null) => void;
  go: (i: number) => void;
  minLabel: string;
}) {
  return (
    <>
      {modules.map((m, i) => {
          // Started (views>0) is NOT done — done requires a full genuine watch.
        const st = !isUnlocked(user, slug, i)
          ? "locked"
          : isDone(user, slug, i)
            ? i === idx ? "current" : "done"
            : i === idx ? "current" : "todo";
        const isOpen = open === i;
        const canOpen = isUnlocked(user, slug, i);
        return (
          <div key={m.t} className="overflow-hidden rounded-xl">
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
      })}
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
  const [content, setContent] = useState<ExamContent | null>(null);
  const [deepReview, setDeepReview] = useState(false);

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
    setContent(null);
    setDeepReview(false);
    if (!isSupabaseConfigured()) return;
    void import("../lib/db/examsDb").then(async (m) => {
      try {
        const id = await m.videoIdBySlug(slug, idx);
        if (!alive || !id) return;
        const [exam, assign] = await Promise.all([
          m.getExam(id, "exam").catch(() => null),
          m.getExam(id, "assignment").catch(() => null),
        ]);
        if (!alive) return;
        setVideoId(id);
        setHas({ exam: exam !== null, assignment: assign !== null });
        const deep = consumeDeepLink();
        if (deep && (deep === "exam" ? exam : assign)) {
          setContent(deep === "exam" ? exam : assign);
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

  const open = async (kind: ExamKind) => {
    if (!videoId) return;
    try {
      const m = await import("../lib/db/examsDb");
      const c = await m.getExam(videoId, kind);
      if (!c) return;
      setContent(c);
      setOpenKind(kind);
      setDeepReview(false);
    } catch {
      /* ignore */
    }
  };

  if (!has.exam && !has.assignment) return null;
  return (
    <div className="mt-6">
      <div className="mt-3 flex flex-wrap gap-3">
        {has.exam && (
          <button type="button" onClick={() => void open("exam")} className="btn btn-primary" style={{ minHeight: 44 }}>
            {x.takeExam}
          </button>
        )}
        {has.assignment && (
          <button type="button" onClick={() => void open("assignment")} className="btn btn-secondary" style={{ minHeight: 44 }}>
            {x.takeAssign}
          </button>
        )}
      </div>
      {openKind && content && videoId && (
        <ExamTake videoId={videoId} kind={openKind} content={content} startInReview={deepReview} onClose={() => { setOpenKind(null); setContent(null); setDeepReview(false); }} />
      )}
    </div>
  );
}

export function Watch({
  slug,
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
    watchAcc.current = { last: 0, total: 0 };
    setRealDur(0);
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
  }, [slug, video]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server truth wins on page open: an admin restart (or another device)
  // only reaches this browser by re-reading — local cache alone would show
  // stale burned-out counts forever. refreshKey lets the limit screen retry.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Parts touched (sticky-unlock persisted) this session — no repeat calls.
  const touchedRef = useRef<string>("");
  useEffect(() => {
    if (!isSupabaseConfigured() || !user || !course) {
      setRefreshing(false);
      return;
    }
    let alive = true;
    setRefreshing(true);
    void import("../lib/db/watchDb")
      .then((m) => m.getWatchStateDb(slug, lang))
      .then((rows) => {
        if (!alive) return;
        replaceProgress(
          user,
          slug,
          rows.map((r) => ({ idx: r.sort_order, views: r.views_count, done: r.done, unlocked: r.unlocked })),
        );
        const cur = rows.find((r) => r.sort_order === idx);
        setPlays(cur ? cur.views_count : 0);
        setDoneTick((n) => n + 1);
        // Persist the open state: an opened-while-entitled part stays open
        // even if an admin later restarts a DIFFERENT part. Burns no views.
        if (cur && cur.unlocked) {
          const key = `${slug}:${idx}`;
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
        if (alive) setRefreshing(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, video, lang, user?.email, refreshKey]);

  if (!user || !enrolled || !course) return null;

  const idx = Math.min(video, course.modules.length - 1);
  const mod = course.modules[idx];
  const vid = videos[idx] ?? { src: "", mins: 10, assign: "", exam: "" };
  const src = vid.src || null;
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
    // count only after 3s of REAL playback — stalls/reloads before that burn nothing
    if (counted.current || seconds < 3 || left <= 0) return;
    counted.current = true;
    setPlays((p) => Math.max(p, recordPlay(user, slug, idx)));
  };

  const onSeeked = (seconds: number) => {
    watchAcc.current.last = seconds;
  };

  const onDuration = (seconds: number) => {
    setRealDur((prev) => (prev > 0 ? prev : seconds));
  };

  const onEnded = () => {
    // completion requires ~80% genuinely watched (or burned views); a seek
    // straight to the end accumulates ~0s and grants nothing. Real media
    // duration wins over the nominal minutes label.
    if (recordDone(user, slug, idx, watchAcc.current.total, realDur, vid.mins)) {
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
              {!src ? (
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
              ) : isYoutubeSource(src) ? (
                <ProtectedVideoPlayer src={src} email={user.email} phone={user.phone} onProgress={onProgress} onSeeked={onSeeked} onDuration={onDuration} onEnded={onEnded} />
              ) : (
                <Player src={src} email={user.email} phone={user.phone} onProgress={onProgress} onSeeked={onSeeked} onDuration={onDuration} onEnded={onEnded} />
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
