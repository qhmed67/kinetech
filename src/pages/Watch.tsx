import { useEffect, useRef, useState } from "react";
import { getCourse, getVideos, useContent, type VideoView } from "../store";
import { ProtectedVideoPlayer } from "../components/ProtectedVideoPlayer";
import { isYoutubeSource } from "../lib/videoGuard";
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
  setDoneFlag,
  setViewsCount,
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
  onEnded,
}: {
  src: string;
  email: string;
  phone: string;
  onProgress: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
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
        const st = !isUnlocked(user, slug, i)
          ? "locked"
          : isDone(user, slug, i) || getViews(user, slug, i) > 0
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

  useEffect(() => {
    counted.current = false;
    watchAcc.current = { last: 0, total: 0 };
    // monotonic: remounts (fullscreen transitions, HMR) can never lower the count
    if (user && course) setPlays((p) => Math.max(p, getViews(user, slug, video)));
    setOpen(video);
    window.scrollTo(0, 0);
  }, [slug, video]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server truth wins on page open: an admin restart (or another device)
  // only reaches this browser by re-reading — local cache alone would show
  // stale burned-out counts forever.
  useEffect(() => {
    if (!isSupabaseConfigured() || !user || !course) return;
    let alive = true;
    void import("../lib/db/watchDb")
      .then((m) => m.getWatchStateDb(slug, lang))
      .then((rows) => {
        if (!alive) return;
        for (const r of rows) {
          setViewsCount(user, slug, r.sort_order, Math.min(3, Math.max(0, r.views_count)));
          if (r.done) setDoneFlag(user, slug, r.sort_order);
          if (r.sort_order === idx) setPlays(r.views_count);
        }
        setDoneTick((n) => n + 1);
      })
      .catch(() => {
        /* offline — local counts stay */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, video, lang, user?.email]);

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

  const onEnded = () => {
    // completion requires ~80% genuinely watched (or burned views); a seek
    // straight to the end accumulates ~0s and grants nothing.
    if (recordDone(user, slug, idx, watchAcc.current.total, vid.mins)) {
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
                  <a href={WA} className="btn btn-primary mt-5">
                    WhatsApp
                  </a>
                </div>
              ) : isYoutubeSource(src) ? (
                <ProtectedVideoPlayer src={src} email={user.email} phone={user.phone} onProgress={onProgress} onSeeked={onSeeked} onEnded={onEnded} />
              ) : (
                <Player src={src} email={user.email} phone={user.phone} onProgress={onProgress} onSeeked={onSeeked} onEnded={onEnded} />
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
