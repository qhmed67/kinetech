import { useEffect, useRef, useState } from "react";
import { getCourse, getVideos, useContent, type VideoView } from "../store";
import type { KtUser } from "../auth";
import { useLang } from "../components/lang";
import {
  MAX_VIEWS,
  getViews,
  isDone,
  isUnlocked,
  recordDone,
  recordPlay,
} from "../watch";

const WA = "https://wa.me/201042031062";

/* Adapter-ready player: file sources resolve through a script-built
   blob/object URL (nothing static in the HTML to copy from view-source).
   A future { kind: "embed", embedUrl } source renders an iframe here. */
function Player({
  src,
  onProgress,
  onEnded,
}: {
  src: string;
  onProgress: (seconds: number) => void;
  onEnded: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

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
      className="overflow-hidden rounded-[20px] select-none"
      style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <video
        key={blobUrl}
        src={blobUrl}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        playsInline
        draggable={false}
        className="aspect-video w-full"
        onTimeUpdate={(e) => onProgress(e.currentTarget.currentTime)}
        onEnded={onEnded}
      />
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

export function Watch({
  slug,
  video,
  user,
}: {
  slug: string;
  video: number;
  user: KtUser | null;
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

  const enrolled = !!user && user.enrolled.includes(slug);

  useEffect(() => {
    if (!user) {
      window.location.href = "signin.html";
      return;
    }
    if (!enrolled) {
      try {
        window.sessionStorage.setItem("kt-watch-denied", "1");
      } catch {
        /* ignore */
      }
      window.location.hash = `#/courses/${slug}`;
    }
  }, [user, enrolled, slug]);

  useEffect(() => {
    counted.current = false;
    // monotonic: remounts (fullscreen transitions, HMR) can never lower the count
    if (user && course) setPlays((p) => Math.max(p, getViews(user, slug, video)));
    setOpen(video);
    window.scrollTo(0, 0);
  }, [slug, video]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // count only after 3s of REAL playback — stalls/reloads before that burn nothing
    if (counted.current || seconds < 3 || left <= 0) return;
    counted.current = true;
    setPlays((p) => Math.max(p, recordPlay(user, slug, idx)));
  };

  const onEnded = () => {
    recordDone(user, slug, idx);
    setDoneTick((n) => n + 1);
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
              ) : (
                <Player src={src} onProgress={onProgress} onEnded={onEnded} />
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

          {/* SIDEBAR — grid order flips it LTR/RTL automatically */}
          <aside
            className="rounded-[20px] border bg-white p-3 lg:sticky lg:top-24"
            style={{ borderColor: "var(--kt-line)" }}
            aria-label={w.contentT}
          >
            <p className="px-2 pb-2 pt-1 text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {w.contentT}
            </p>
            {course.modules.map((m, i) => {
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
                        {videos[i]?.mins ?? 10} {w.min}
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
          </aside>
        </div>
      </div>
    </main>
  );
}
