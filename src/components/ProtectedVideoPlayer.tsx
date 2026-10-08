import { useCallback, useEffect, useRef, useState } from "react";
import {
  YT_STATE,
  extractYoutubeId,
  formatClock,
  loadYoutubeApi,
  obfuscateId,
  useRotatingSession,
  type YtPlayer,
} from "../lib/videoGuard";

export type ProtectedVideoPlayerProps = {
  /** Any YouTube URL form or raw ID. Encoded in-memory on mount — never rendered. */
  src: string;
  email: string;
  phone: string;
  onProgress: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
  onEnded: () => void;
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

const WM_SPOTS = [
  { top: 12, insetInlineStart: 12 },
  { top: 12, insetInlineEnd: 12 },
  { bottom: 64, insetInlineStart: 12 },
  { bottom: 64, insetInlineEnd: 12 },
] as const;

/**
 * Enterprise-style guarded player over an UNLISTED YouTube source.
 * Zero native chrome; all input flows through our overlay + custom bar.
 *
 * Honest limits: this defeats casual ripping (context menu, extensions
 * reading static links, fullscreen clean-capture). A determined attacker
 * with DevTools + time can still extract the stream — that half is enforced
 * server-side (signed-in RPCs, 3-view cap, watermarked identity).
 */
export function ProtectedVideoPlayer({
  src,
  email,
  phone,
  onProgress,
  onSeeked,
  onEnded,
}: ProtectedVideoPlayerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const cbRef = useRef({ onProgress, onSeeked, onEnded });
  cbRef.current = { onProgress, onSeeked, onEnded };

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Poster covers the unstarted frame (where YouTube shows title/avatar).
  const [started, setStarted] = useState(false);
  const gotQualities = useRef(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [showRemaining, setShowRemaining] = useState(false);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [qualities, setQualities] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [spot, setSpot] = useState(() => Math.floor(Math.random() * WM_SPOTS.length));

  const sessionToken = useRotatingSession();
  const lastPoll = useRef(0);
  const endedRef = useRef(false);

  // Watermark drift.
  useEffect(() => {
    const id = window.setInterval(
      () => setSpot((s) => (s + 1 + Math.floor(Math.random() * (WM_SPOTS.length - 1))) % WM_SPOTS.length),
      15000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Build the player once per src. Raw ID lives only in this closure.
  useEffect(() => {
    let alive = true;
    let player: YtPlayer | null = null;
    let poll: number | null = null;
    setReady(false);
    setFailed(false);
    setPlaying(false);
    setStarted(false);
    gotQualities.current = false;
    setQualities([]);
    setQuality("auto");
    setTime(0);
    setDur(0);
    endedRef.current = false;

    const rawId = extractYoutubeId(src);
    if (!rawId) {
      setFailed(true);
      return;
    }
    const encoded = obfuscateId(rawId);

    const boot = async () => {
      try {
        const api = await loadYoutubeApi();
        if (!alive || !mountRef.current) return;
        // Decode at the last possible moment; the DOM/script never holds it.
        const videoId = (await import("../lib/videoGuard")).deobfuscateId(encoded);
        if (!alive || !mountRef.current) return;
        player = new api.Player(mountRef.current, {
          videoId,
          playerVars: {
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (!alive) return;
              playerRef.current = e.target;
              try {
                // Full input capture: the frame never receives pointer input.
                e.target.getIframe().style.pointerEvents = "none";
                const levels = e.target.getAvailableQualityLevels?.() ?? [];
                if (levels.length > 0) setQualities(["auto", ...levels]);
                setMuted(e.target.isMuted?.() ?? false);
              } catch {
                /* ignore */
              }
              setReady(true);
            },
            onStateChange: (e) => {
              if (!alive) return;
              setPlaying(e.data === YT_STATE.PLAYING || e.data === YT_STATE.BUFFERING);
              if (e.data !== YT_STATE.UNSTARTED && e.data !== YT_STATE.CUED) setStarted(true);
              if (e.data === YT_STATE.ENDED && !endedRef.current) {
                endedRef.current = true;
                cbRef.current.onEnded();
              }
              if (e.data === YT_STATE.PLAYING) endedRef.current = false;
            },
            onError: () => {
              if (alive) setFailed(true);
            },
          },
        });
        playerRef.current = player;
        poll = window.setInterval(() => {
          const p = playerRef.current;
          if (!p) return;
          try {
            // Quality list is empty until metadata loads — refresh until filled.
            if (!gotQualities.current) {
              try {
                const levels = p.getAvailableQualityLevels?.() ?? [];
                if (levels.length > 0) {
                  gotQualities.current = true;
                  setQualities(["auto", ...levels]);
                }
              } catch {
                /* retry next tick */
              }
            }
            const t = p.getCurrentTime() ?? 0;
            const d = p.getDuration() ?? 0;
            // Continuity check: jumps >2s are seeks, reported once.
            if (Math.abs(t - lastPoll.current) > 2 && lastPoll.current > 0) {
              cbRef.current.onSeeked(t);
            }
            lastPoll.current = t;
            setTime(t);
            if (d > 0) setDur(d);
            cbRef.current.onProgress(t);
          } catch {
            /* player torn down */
          }
        }, 250);
      } catch {
        if (alive) setFailed(true);
      }
    };
    void boot();
    return () => {
      alive = false;
      if (poll !== null) window.clearInterval(poll);
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [src]);

  // Session rotation: re-assert isolation without touching playback.
  useEffect(() => {
    void sessionToken.current;
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
    setQuality(q);
    try {
      if (q !== "auto") playerRef.current?.setPlaybackQuality(q);
    } catch {
      /* ignore */
    }
  }, []);

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
  const wmText = [email, phone].filter(Boolean).join(" • ");

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={blockKeys}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onDoubleClick={toggleFullscreen}
      className="pvp relative aspect-video w-full overflow-hidden rounded-[20px] outline-none select-none"
      style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
      aria-label="Protected video player"
    >
      {/* Video canvas (pointer-dead iframe inside). */}
      <div ref={mountRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />

      {/* Click-capturing shield: no click/right-click/drag ever reaches YouTube. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10"
        onClick={togglePlay}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.stopPropagation()}
      />

      {/* Permanent top bar: fully masks YouTube's title/avatar/share row in
          every state (params alone can't remove it anymore). Solid brand
          chrome reads as our own header, not a cover-up. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-12 items-center px-4"
        style={{ background: "#000" }}
      >
        <span
          aria-hidden="true"
          className="text-sm font-bold tracking-wide text-white/90"
          style={{ fontFamily: "var(--font-display)" }}
        >
          KINE<span style={{ color: "var(--kt-teal)" }}>TECH</span>
        </span>
      </div>

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
      {wmText !== "" && (
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
      )}

      {/* Bottom-left brand bug: sits over YouTube's logo zone. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-20 left-3 z-20 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide text-white"
        style={{ background: "rgba(0,0,0,0.65)", fontFamily: "var(--font-display)" }}
      >
        KINE<span style={{ color: "var(--kt-teal)" }}>TECH</span>
      </div>

      {!ready && (
        <div className="absolute inset-0 z-20 grid animate-pulse place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} aria-label="loading" />
      )}

      {/* Custom control bar — the only visible chrome. */}
      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8 sm:px-4">
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
