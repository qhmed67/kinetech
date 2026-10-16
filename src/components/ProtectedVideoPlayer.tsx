import { useCallback, useEffect, useRef, useState } from "react";
import {
  YT_STATE,
  extractYoutubeId,
  formatClock,
  isDriveSource,
  loadYoutubeApi,
  obfuscateId,
  useRotatingSession,
  type YtPlayer,
} from "../lib/videoGuard";

export type PlayDenied = { status: number; code: string; ar: string; en: string };

export type ProtectedVideoPlayerProps = {
  /** videos.id — the playable URL is NEVER in props/DOM. Fetched once per
      mount from POST /api/play (server counts the view there). */
  videoId: string;
  onProgress: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
  onDenied: (e: PlayDenied) => void;
  onSessionDead: () => void;
};

type PlayGrant = {
  embedUrl: string;
  minutes: number;
  email: string;
  phoneLast4: string;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const QUALITY_LABEL: Record<string, string> = {
  highres: "2160p",
  hd2160: "2160p",
  hd1440: "1440p",
  hd1080: "1080p",
  hd720: "720p",
  large: "480p",
  medium: "360p",
  small: "240p",
  tiny: "144p",
  auto: "Auto",
};

/** Quality rung order, low → high. Used to always keep the better segment. */
const QUALITY_RANK = ["tiny", "small", "medium", "large", "hd720", "hd1080", "hd1440", "hd2160", "highres"];

function qualityRank(q: string): number {
  const i = QUALITY_RANK.indexOf(q);
  return i < 0 ? -1 : i;
}

const WM_SPOTS = [
  { top: 12, insetInlineStart: 12 },
  { top: 12, insetInlineEnd: 12 },
  { bottom: 64, insetInlineStart: 12 },
  { bottom: 64, insetInlineEnd: 12 },
] as const;

/**
 * Guarded player over server-issued embed URLs (POST /api/play).
 * The raw Drive/YouTube URL never sits in props, state, or the DOM — only
 * the sandboxed embed URL the server minted for this session.
 * YouTube keeps zero native chrome + custom bar; Drive preview and legacy
 * mp4 render in hardened frames with the same watermark + completion wiring.
 *
 * Honest limits: the Drive FILE ID is visible in the browser at playback
 * time (iframe src, network tab), and screen recording cannot be blocked by
 * any website technology. Real protection stays server-side (single session,
 * enrollment + 3-view cap + rate/suspicion rules, watermarked identity).
 */
export function ProtectedVideoPlayer({
  videoId,
  onProgress,
  onSeeked,
  onDuration,
  onEnded,
  onDenied,
  onSessionDead,
}: ProtectedVideoPlayerProps) {
  const cbAllRef = useRef({ onDuration });
  cbAllRef.current.onDuration = onDuration;
  const cbRef = useRef({ onProgress, onSeeked, onEnded, onDenied, onSessionDead });
  cbRef.current = { onProgress, onSeeked, onEnded, onDenied, onSessionDead };
  const boxRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);

  // Play grant from the server; null until /api/play answers.
  const [grant, setGrant] = useState<PlayGrant | null>(null);
  // Terminal (denied/session-dead): parent takes over the area.
  const [over, setOver] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Poster covers the unstarted frame (where YouTube shows title/avatar).
  const [started, setStarted] = useState(false);
  // Non-YouTube poster gate (Drive preview / mp4 need an explicit start).
  const [mediaStarted, setMediaStarted] = useState(false);
  const gotQualities = useRef(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [showRemaining, setShowRemaining] = useState(false);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [qualities, setQualities] = useState<string[]>([]);
  // Rebuild veil: quality swaps destroy/recreate the player — show an
  // explicit loading state so it reads as switching, not freezing.
  const [switching, setSwitching] = useState(false);
  // Idle chrome: bar + cursor vanish 3s after the last mouse move (playing only).
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | null>(null);

  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 3000);
  }, []);

  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, [wake]);
  // Per-segment quality memory: [{t, q}] — a user change applies from that
  // timestamp forward; seeking back restores the earlier segment's quality,
  // always keeping the better one (auto regions resolve to top available).
  const qualityMarks = useRef<Array<{ t: number; q: string }>>([{ t: 0, q: "auto" }]);
  const levelsRef = useRef<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [spot, setSpot] = useState(() => Math.floor(Math.random() * WM_SPOTS.length));

  const sessionToken = useRotatingSession();
  const lastPoll = useRef(0);
  const endedRef = useRef(false);
  // Preview watchdog/retry + wall-clock completion for API-less frames.
  const [frameFailed, setFrameFailed] = useState(false);
  const [frameRetry, setFrameRetry] = useState(0);
  const elapsedRef = useRef(0);
  const mediaRef = useRef<HTMLVideoElement>(null);

  // Watermark drift.
  useEffect(() => {
    const id = window.setInterval(
      () => setSpot((s) => (s + 1 + Math.floor(Math.random() * (WM_SPOTS.length - 1))) % WM_SPOTS.length),
      15000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Grant fetch: exactly one /api/play per mount. AbortController (not a
  // ref guard) handles React StrictMode double-effects: the first request
  // is cancelled before a second can start, and the server's 30-minute
  // repeat window makes any residual duplicate free anyway.
  useEffect(() => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let alive = true;
    setGrant(null);
    setOver(false);
    setReady(false);
    setFailed(false);
    setPlaying(false);
    setStarted(false);
    setMediaStarted(false);
    setFrameFailed(false);
    gotQualities.current = false;
    setQualities([]);
    setQuality("auto");
    qualityMarks.current = [{ t: 0, q: "auto" }];
    levelsRef.current = [];
    setTime(0);
    setDur(0);
    lastPoll.current = 0;
    endedRef.current = false;
    elapsedRef.current = 0;
    void (async () => {
      try {
        const { supabase } = await import("../lib/db/client");
        const sb = supabase();
        const session = sb
          ? await Promise.race([
              sb.auth.getSession(),
              new Promise<null>((res) => window.setTimeout(() => res(null), 10000)),
            ])
          : null;
        const token = session && typeof session === "object" && "data" in session
          ? (session as { data: { session: { access_token: string } | null } }).data.session?.access_token ?? null
          : null;
        if (!alive) return;
        if (!token) {
          setOver(true);
          cbRef.current.onSessionDead();
          return;
        }
        const r = await fetch("/api/play", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ video_id: videoId }),
          signal: ctl?.signal,
        }).catch(() => null);
        if (!alive) return;
        if (!r) {
          setFailed(true);
          return;
        }
        const body = (await r.json().catch(() => null)) as {
          ok?: boolean; code?: string; ar?: string; en?: string;
          embedUrl?: string; minutes?: number;
          watermark?: { email?: string; phoneLast4?: string };
        } | null;
        if (!alive) return;
        if (!r.ok || !body || body.ok !== true || typeof body.embedUrl !== "string") {
          const code = typeof body?.code === "string" ? body.code : "";
          if (r.status === 401 || code === "SESSION_MISMATCH" || code === "INVALID_TOKEN") {
            setOver(true);
            cbRef.current.onSessionDead();
          } else {
            setOver(true);
            cbRef.current.onDenied({
              status: r.status,
              code,
              ar: typeof body?.ar === "string" ? body.ar : "",
              en: typeof body?.en === "string" ? body.en : "",
            });
          }
          return;
        }
        setGrant({
          embedUrl: body.embedUrl,
          minutes: typeof body.minutes === "number" ? body.minutes : 0,
          email: body.watermark?.email ?? "",
          phoneLast4: body.watermark?.phoneLast4 ?? "",
        });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      try {
        ctl?.abort();
      } catch {
        /* ignore */
      }
      genRef.current += 1;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const embedUrl = grant?.embedUrl ?? null;
  const isYt = embedUrl !== null && extractYoutubeId(embedUrl) !== null;
  const isDrive = embedUrl !== null && !isYt && isDriveSource(embedUrl);

  // Player construction, reusable for initial build AND quality rebuilds.
  // Raw ID + API live in refs (memory only); stale generations are ignored.
  const apiRef = useRef<import("../lib/videoGuard").YtApi | null>(null);
  const videoIdRef = useRef<string>("");
  const genRef = useRef(0);
  const slotRef = useRef<HTMLDivElement>(null);

  const spawn = useCallback((startAt: number, vq: string | null, autoplay: boolean) => {
    const api = apiRef.current;
    const videoId = videoIdRef.current;
    const slot = slotRef.current;
    if (!api || !videoId || !slot) return;
    const gen = ++genRef.current;
    try {
      playerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    slot.innerHTML = "";
    const holder = document.createElement("div");
    holder.style.width = "100%";
    holder.style.height = "100%";
    slot.appendChild(holder);
    const vars: Record<string, number | string> = {
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      fs: 0,
      iv_load_policy: 3,
      playsinline: 1,
      origin: window.location.origin,
    };
    // Forced default quality: applies from the first frame, no drift-in.
    if (vq) vars.vq = vq;
    const player = new api.Player(holder, {
      videoId,
      playerVars: vars,
      events: {
        onReady: (e) => {
          if (gen !== genRef.current) return;
          playerRef.current = e.target;
          setSwitching(false);
          try {
            // Full input capture: the frame never receives pointer input.
            e.target.getIframe().style.pointerEvents = "none";
            const levels = e.target.getAvailableQualityLevels?.() ?? [];
            if (levels.length > 0) {
              gotQualities.current = true;
              levelsRef.current = levels;
              setQualities(["auto", ...levels]);
            }
            setMuted(e.target.isMuted?.() ?? false);
            if (startAt > 0.5) e.target.seekTo(startAt, true);
            if (autoplay) e.target.playVideo();
          } catch {
            /* ignore */
          }
          setReady(true);
        },
        onStateChange: (e) => {
          if (gen !== genRef.current) return;
          setPlaying(e.data === YT_STATE.PLAYING || e.data === YT_STATE.BUFFERING);
          if (e.data !== YT_STATE.UNSTARTED && e.data !== YT_STATE.CUED) setStarted(true);
          if (e.data === YT_STATE.ENDED && !endedRef.current) {
            endedRef.current = true;
            cbRef.current.onEnded();
          }
          if (e.data === YT_STATE.PLAYING) endedRef.current = false;
        },
        onError: () => {
          if (gen === genRef.current) setFailed(true);
        },
      },
    });
    playerRef.current = player;
  }, []);

  // YouTube build once the grant lands. Raw ID lives only in ref.
  useEffect(() => {
    if (!grant || !isYt || !embedUrl) return;
    let alive = true;
    const rawId = extractYoutubeId(embedUrl);
    if (!rawId) {
      setFailed(true);
      return;
    }
    const encoded = obfuscateId(rawId);
    void (async () => {
      try {
        const [api, guard] = await Promise.all([loadYoutubeApi(), import("../lib/videoGuard")]);
        if (!alive) return;
        apiRef.current = api;
        // Decode at the last possible moment; the DOM/script never holds it.
        videoIdRef.current = guard.deobfuscateId(encoded);
        if (!alive) return;
        spawn(0, null, false);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [grant, isYt, embedUrl, spawn]);

  // Server minutes feed duration-dependent UI for API-less frames (and the
  // minutes self-heal downstream). YouTube reports its exact media length.
  useEffect(() => {
    if (!grant || isYt) return;
    if (grant.minutes > 0) cbAllRef.current.onDuration(grant.minutes * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant]);

  // Telemetry poll, independent of (re)builds.
  useEffect(() => {
    const poll = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        // Quality list is empty until metadata loads — refresh until filled.
        if (!gotQualities.current) {
          try {
            const levels = p.getAvailableQualityLevels?.() ?? [];
            if (levels.length > 0) {
              gotQualities.current = true;
              levelsRef.current = levels;
              setQualities(["auto", ...levels]);
            }
          } catch {
            /* retry next tick */
          }
        }
        const t = p.getCurrentTime() ?? 0;
        const d = p.getDuration() ?? 0;
        // Segment memory: enforce the quality belonging to this timestamp.
        // "auto" regions resolve upward — never downgrade a better segment.
        try {
          const marks = qualityMarks.current;
          let active = marks[0];
          for (const m of marks) {
            if (m.t <= t + 0.5) active = m;
            else break;
          }
          const cur = p.getPlaybackQuality?.() ?? "auto";
          if (active.q === "auto") {
            const top = [...levelsRef.current].sort((a, b) => qualityRank(b) - qualityRank(a))[0];
            if (top && cur !== "auto" && cur !== top && qualityRank(cur) < qualityRank(top)) {
              p.setPlaybackQuality(top);
              setQuality(top);
            }
          } else if (cur !== active.q) {
            p.setPlaybackQuality(active.q);
            setQuality(active.q);
          }
        } catch {
          /* player torn down */
        }
        // Continuity check: jumps >2s are seeks, reported once.
        if (Math.abs(t - lastPoll.current) > 2 && lastPoll.current > 0) {
          cbRef.current.onSeeked(t);
        }
            lastPoll.current = t;
            setTime(t);
            if (d > 0) {
              setDur((prev) => {
                if (prev <= 0) cbAllRef.current.onDuration(d);
                return d;
              });
            }
            cbRef.current.onProgress(t);
      } catch {
        /* player torn down */
      }
    }, 250);
    return () => window.clearInterval(poll);
  }, [videoId]);

  // Preview watchdog: unresolvable hosts never fire onLoad — show retry.
  useEffect(() => {
    if (!grant || !isDrive || !mediaStarted || ready || frameFailed) return;
    const id = window.setTimeout(() => setFrameFailed(true), 20000);
    return () => window.clearTimeout(id);
  }, [grant, isDrive, mediaStarted, ready, frameFailed]);

  // Wall-clock completion for API-less frames (Drive preview offers no play
  // state; the server already counted the view at grant time).
  useEffect(() => {
    if (!grant || !isDrive || !mediaStarted) return;
    const need = Math.max(60, Math.round((grant.minutes || 10) * 60 * 0.8));
    const id = window.setInterval(() => {
      if (document.hidden) return;
      elapsedRef.current += 1;
      const n = elapsedRef.current;
      cbRef.current.onProgress(n);
      if (n >= need && !endedRef.current) {
        endedRef.current = true;
        cbRef.current.onEnded();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [grant, isDrive, mediaStarted]);

  // Poster click chains into native playback while the tap gesture is fresh.
  useEffect(() => {
    if (mediaStarted && grant && !isYt && !isDrive && mediaRef.current) {
      mediaRef.current.play().catch(() => {
        /* native controls take over */
      });
    }
  }, [mediaStarted, grant, isYt, isDrive]);

  // Session rotation: re-assert isolation without touching playback.
  // sessionToken is a state string, so each rotation re-runs this effect.
  useEffect(() => {
    void sessionToken;
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      p.getIframe().style.pointerEvents = "none";
      void p.getVideoUrl();
    } catch {
      /* ignore */
    }
  }, [ready, sessionToken]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const st = p.getPlayerState();
      if (st === YT_STATE.PLAYING || st === YT_STATE.BUFFERING) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* ignore */
    }
  }, []);

  const scrub = useCallback(
    (frac: number) => {
      const p = playerRef.current;
      if (!p || dur <= 0) return;
      const t = Math.min(Math.max(frac, 0), 1) * dur;
      try {
        p.seekTo(t, true);
        cbRef.current.onSeeked(t);
        lastPoll.current = t;
        setTime(t);
      } catch {
        /* ignore */
      }
    },
    [dur],
  );

  const changeRate = useCallback((r: number) => {
    setRate(r);
    try {
      playerRef.current?.setPlaybackRate(r);
    } catch {
      /* ignore */
    }
  }, []);

  const changeQuality = useCallback((q: string) => {
    // A manual change applies from NOW forward: record the segment boundary
    // so seeking back restores the earlier segment's (better) quality.
    // Hard switch: rebuild the player at the current timestamp with a forced
    // vq — the new quality renders from the first new frame, no drift-in.
    try {
      const p = playerRef.current;
      const at = p?.getCurrentTime?.() ?? lastPoll.current;
      const marks = qualityMarks.current;
      const last = marks[marks.length - 1];
      if (!last || Math.abs(last.t - at) > 1 || last.q !== q) {
        marks.push({ t: Math.max(0, at), q });
        marks.sort((a, b) => a.t - b.t);
      }
      setQuality(q);
      if (!p) return;
      const st = p.getPlayerState();
      const wasPlaying = st === YT_STATE.PLAYING || st === YT_STATE.BUFFERING;
      setSwitching(true);
      spawn(Math.max(0, at), q === "auto" ? null : q, wasPlaying);
    } catch {
      /* ignore */
    }
  }, [spawn]);

  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.isMuted()) {
        p.unMute();
        setMuted(false);
      } else {
        p.mute();
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  const blockKeys = useCallback((e: React.KeyboardEvent) => {
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (
      k === "F12" ||
      (mod && e.shiftKey && ["I", "J", "C", "i", "j", "c"].includes(k)) ||
      (mod && (k === "u" || k === "U" || k === "s" || k === "S"))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (k === " " && (e.target as HTMLElement)?.tagName !== "INPUT") {
      e.preventDefault();
      togglePlay();
    }
  }, [togglePlay]);

  if (over) return null;

  if (failed) {
    return (
      <div
        className="grid aspect-video w-full place-items-center rounded-[20px] border p-8 text-center"
        style={{ borderColor: "var(--kt-line)", background: "#000" }}
        role="alert"
      >
        <p className="font-bold text-white">Video unavailable right now — try again in a moment.</p>
      </div>
    );
  }

  const frac = dur > 0 ? Math.min(time / dur, 1) : 0;
  const label = showRemaining ? `-${formatClock(dur - time)}` : formatClock(time);
  const pos = WM_SPOTS[spot % WM_SPOTS.length];
  const wmText = [grant?.email ?? "", grant?.phoneLast4 ?? ""].filter(Boolean).join(" • ");

  const poster = (start: () => void, readyToShow: boolean) =>
    !readyToShow ? null : (
      <button
        type="button"
        onClick={() => {
          start();
          wake();
        }}
        aria-label="Start video"
        className="absolute inset-0 z-20 grid place-items-center"
        style={{ background: "linear-gradient(135deg, #3A1E6B 0%, #6E4E9C 55%, #3D3250 100%)" }}
      >
        <span
          aria-hidden="true"
          className="grid h-20 w-20 place-items-center rounded-full transition hover:scale-105"
          style={{ background: "#3BBCD9" }}
        >
          <svg viewBox="0 0 24 24" fill="#fff" className="h-9 w-9 translate-x-0.5" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
        </span>
      </button>
    );

  const watermark = wmText !== "" && (
    <div
      aria-hidden="true"
      dir="ltr"
      className="pointer-events-none absolute z-20 max-w-[70%] truncate rounded-lg px-3 py-1.5 text-xs font-bold"
      style={{
        ...pos,
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "var(--font-display)",
      }}
    >
      {wmText}
    </div>
  );

  const shell = (body: React.ReactNode, extraClass: string) => (
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={blockKeys}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onDoubleClick={toggleFullscreen}
      onMouseMove={wake}
      className={`pvp relative aspect-video w-full overflow-hidden rounded-[20px] outline-none select-none ${extraClass}`}
      style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
      aria-label="Protected video player"
    >
      {body}
    </div>
  );

  // Grant pending: spinner, no URL anywhere yet.
  if (!grant || !embedUrl) {
    return shell(
      <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} aria-label="loading">
        <span
          aria-hidden="true"
          className="h-12 w-12 animate-spin rounded-full"
          style={{ border: "4px solid rgba(255,255,255,0.25)", borderTopColor: "#3BBCD9" }}
        />
      </div>,
      "",
    );
  }

  /* Drive preview: sandboxed iframe. Sandbox = allow-scripts +
     allow-same-origin ONLY (no downloads/pop-outs/popups, no PiP token).
     Clicks must reach Drive's own controls — no click shield; right-clicks
     inside the frame stay Google's, unblockable cross-origin. */
  if (isDrive) {
    return shell(
      <>
        {mediaStarted ? (
          <iframe
            key={`${embedUrl}:${frameRetry}`}
            src={embedUrl}
            title="Course video"
            sandbox="allow-scripts allow-same-origin"
            allow="autoplay; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
            onLoad={() => setReady(true)}
            className="absolute inset-0 h-full w-full"
            style={{ border: 0 }}
          />
        ) : (
          poster(() => setMediaStarted(true), true)
        )}
        {watermark}
        {mediaStarted && !ready && !frameFailed && (
          <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} aria-label="loading">
            <span
              aria-hidden="true"
              className="h-12 w-12 animate-spin rounded-full"
              style={{ border: "4px solid rgba(255,255,255,0.25)", borderTopColor: "#3BBCD9" }}
            />
          </div>
        )}
        {mediaStarted && frameFailed && (
          <div className="absolute inset-0 z-20 grid place-items-center p-6 text-center" style={{ background: "rgba(0,0,0,0.85)" }} role="alert">
            <div className="grid max-w-md gap-3">
              <p className="font-bold text-white">Video didn&apos;t load — check your connection and try again.</p>
              <p className="font-bold text-white" dir="rtl">الفيديو متحملش — اتأكد من النت وحاول تاني.</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                If nothing loads either, switch network or pause adblock/VPN — then retry.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setFrameFailed(false);
                    setReady(false);
                    setFrameRetry((k) => k + 1);
                  }}
                  className="btn btn-primary"
                >
                  Try again · حاول تاني
                </button>
              </div>
            </div>
          </div>
        )}
      </>,
      idle && mediaStarted ? "cursor-none" : "",
    );
  }

  // Legacy direct file (seeds): native element, real media events.
  if (!isYt) {
    return shell(
      <>
        <video
          ref={mediaRef}
          key={embedUrl}
          src={embedUrl}
          controls={mediaStarted}
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) cbAllRef.current.onDuration(d);
          }}
          onCanPlay={() => setReady(true)}
          onTimeUpdate={(e) => cbRef.current.onProgress(e.currentTarget.currentTime)}
          onSeeked={(e) => cbRef.current.onSeeked(e.currentTarget.currentTime)}
          onEnded={() => {
            if (!endedRef.current) {
              endedRef.current = true;
              cbRef.current.onEnded();
            }
          }}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full"
          style={{ background: "#000" }}
        />
        {poster(() => setMediaStarted(true), !mediaStarted)}
        {watermark}
        {mediaStarted && !ready && (
          <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} aria-label="loading">
            <span
              aria-hidden="true"
              className="h-12 w-12 animate-spin rounded-full"
              style={{ border: "4px solid rgba(255,255,255,0.25)", borderTopColor: "#3BBCD9" }}
            />
          </div>
        )}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/70 to-transparent px-3 pb-2.5 pt-12 transition-opacity duration-300 sm:px-4 ${idle && mediaStarted ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <div className="mt-1 flex items-center gap-1.5 text-white sm:gap-2">
            <button type="button" onClick={toggleFullscreen} aria-label="Fullscreen" className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="flex-1" />
          </div>
        </div>
      </>,
      idle && mediaStarted ? "cursor-none" : "",
    );
  }

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={blockKeys}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onDoubleClick={toggleFullscreen}
      onMouseMove={wake}
      className={`pvp relative aspect-video w-full overflow-hidden rounded-[20px] outline-none select-none ${idle && playing ? "cursor-none" : ""}`}
      style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
      aria-label="Protected video player"
    >
      {/* Video canvas, exact fill. Inner slot is replaced on quality
          rebuilds; React never owns children below mountRef. */}
      <div ref={mountRef} className="pvp-frame absolute [&>iframe]:h-full [&>iframe]:w-full">
        <div ref={slotRef} className="absolute inset-0" />
      </div>

      {/* Click-capturing shield: no click/right-click/drag ever reaches YouTube. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10"
        onClick={() => {
          togglePlay();
          wake();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.stopPropagation()}
      />

      {/* Slim top fade only — no bars, no text, no borders over the video. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-black/50 to-transparent"
      />

      {/* Poster: covers the unstarted frame until first playback. */}
      {ready && !started && !failed && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 z-20 grid place-items-center"
          style={{ background: "linear-gradient(135deg, #3A1E6B 0%, #6E4E9C 55%, #3D3250 100%)" }}
        >
          <span
            aria-hidden="true"
            className="grid h-20 w-20 place-items-center rounded-full transition hover:scale-105"
            style={{ background: "#3BBCD9" }}
          >
            <svg viewBox="0 0 24 24" fill="#fff" className="h-9 w-9 translate-x-0.5" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          </span>
        </button>
      )}

      {/* Floating identity watermark. */}
      {watermark}

      {(!ready || switching) && (
        <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(0,0,0,0.55)" }} aria-label="loading">
          <span
            aria-hidden="true"
            className="h-12 w-12 animate-spin rounded-full"
            style={{ border: "4px solid rgba(255,255,255,0.25)", borderTopColor: "#3BBCD9" }}
          />
        </div>
      )}

      {/* Custom control bar — the only visible chrome. Deep gradient swallows
          any native bottom-row leftovers. Fades out after 3s idle while playing. */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/70 to-transparent px-3 pb-2.5 pt-12 transition-opacity duration-300 sm:px-4 ${idle && playing ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(frac * 1000)}
          onChange={(e) => scrub(Number(e.target.value) / 1000)}
          aria-label="Seek"
          className="w-full accent-white"
          dir="ltr"
        />
        <div className="mt-1 flex items-center gap-1.5 text-white sm:gap-2">
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowRemaining((v) => !v)}
            dir="ltr"
            aria-label="Toggle time display"
            className="rounded px-1.5 py-1 text-[13px] font-bold tabular-nums transition hover:bg-white/15"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {label}
          </button>
          <span className="flex-1" />
          <label className="flex items-center gap-1 text-[12px] font-bold">
            <span className="sr-only">Speed</span>
            <select
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              aria-label="Playback speed"
              dir="ltr"
              className="rounded-md bg-white/10 px-1.5 py-1 tabular-nums outline-none transition hover:bg-white/20 [&>option]:text-black"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
          </label>
          {qualities.length > 1 && (
            <label className="flex items-center gap-1 text-[12px] font-bold">
              <span className="sr-only">Quality</span>
              <select
                value={quality}
                onChange={(e) => changeQuality(e.target.value)}
                aria-label="Quality"
                dir="ltr"
                className="rounded-md bg-white/10 px-1.5 py-1 tabular-nums outline-none transition hover:bg-white/20 [&>option]:text-black"
              >
                {qualities.map((q) => (
                  <option key={q} value={q}>{QUALITY_LABEL[q] ?? q}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={toggleFullscreen} aria-label="Fullscreen" className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
