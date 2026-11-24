import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/http";
import { getAccessToken } from "../lib/accessToken";
import { workerFailAgeMs } from "../lib/workerFailMarker";
import { refreshLeadMs } from "../lib/streamToken";
import "./workerPlayer.css";

/** Same state machine the parent orchestrator owns (Worker → Direct → YouTube). */
export type WorkerPlayerState = "inline" | "expanding" | "expanded" | "collapsing";

export type WorkerVideoPlayerProps = {
  /** Worker stream URL — carries a signed token, never a Drive file id. */
  src: string;
  /** ISO expiry of the current token (drives the silent refresh). */
  expiresAt?: string;
  /** Lifetime of the current token in seconds (server-decided). Used to
   *  schedule the refresh proportionally — a short token must not be
   *  refreshed on a fixed 5-minute lead, or it would loop. */
  ttlSeconds?: number;
  /** videos.id — used only by the refresh endpoint. */
  videoId: string;
  native: boolean;
  /** Watermark node from the parent (identity text + drift position). */
  watermark: React.ReactNode;
  playerState: WorkerPlayerState;
  onExpand: () => void;
  onCollapse: () => void;
  safeInsets: () => { top: number; right: number; bottom: number; left: number };
  debugOn: boolean;
  onProgress: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onEnded: () => void;
  /** Worker became healthy (first successful frame) — the parent clears its
   *  "worker failed" marker so the next lesson retries the Worker tier. */
  onWorkerHealthy?: () => void;
  /** The Worker tier is dead: the parent switches to Direct / YouTube. */
  onFatal: (reason: string) => void;
};

/** The refresh lead lives in lib/streamToken.ts (`refreshLeadMs`) so it can be
 *  unit-tested: the lead is a fifth of the token lifetime, at least 30 s and
 *  at most 5 minutes. */
/** No first frame this long after a source swap → treat as stalled. */
const CANPLAY_TIMEOUT_MS = 12_000;
/** Buffering this long mid-playback → treat as stalled. */
const STALL_TIMEOUT_MS = 15_000;

export function WorkerVideoPlayer({
  src,
  expiresAt,
  ttlSeconds,
  videoId,
  native,
  watermark,
  playerState,
  onExpand,
  onCollapse,
  safeInsets,
  debugOn,
  onProgress,
  onSeeked,
  onDuration,
  onEnded,
  onWorkerHealthy,
  onFatal,
}: WorkerVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const plyrRef = useRef<Plyr | null>(null);

  const cbRef = useRef({ onProgress, onSeeked, onDuration, onEnded, onFatal, onWorkerHealthy });
  // Keep the latest callbacks reachable from native media listeners without
  // re-binding them on every render.
  useEffect(() => {
    cbRef.current = { onProgress, onSeeked, onDuration, onEnded, onFatal, onWorkerHealthy };
  });
  const expandCollapseRef = useRef({ onExpand, onCollapse, playerState });
  expandCollapseRef.current = { onExpand, onCollapse, playerState };

  const [currentSrc, setCurrentSrc] = useState(src);
  const currentSrcRef = useRef(src);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [debugLocal, setDebugLocal] = useState(false);
  const [dbg, setDbg] = useState<Record<string, unknown>>({});
  // Last Worker error (status + non-secret reason from the error body) — for
  // the debug strip. Never values (ids/tokens).
  const [workerInfo, setWorkerInfo] = useState<Record<string, unknown>>({});

  const [exp, setExp] = useState<number>(() => (expiresAt ? Date.parse(expiresAt) : 0));
  const expiresRef = useRef<number>(expiresAt ? Date.parse(expiresAt) : 0);
  // Lifetime of the current token. The server decides it; the player only
  // uses it to time the silent refresh.
  const [ttl, setTtl] = useState<number>(ttlSeconds ?? 0);
  const fatalRef = useRef(false);
  const refreshRef = useRef<Promise<boolean> | null>(null);
  const resumeRef = useRef<{ t: number; play: boolean } | null>(null);
  const errCount = useRef(0);
  const canplayTimer = useRef<number | null>(null);
  const waitStart = useRef(0);
  const pressTimer = useRef<number | null>(null);

  const debugVisible = debugOn || debugLocal;

  const fail = useCallback((reason: string) => {
    if (fatalRef.current) return;
    fatalRef.current = true;
    cbRef.current.onFatal(reason);
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (refreshRef.current) return refreshRef.current;
    const run = (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return false;
        const r = await apiFetch("/api/playback/stream-refresh", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ video_id: videoId }),
        });
        const body = (await r.json().catch(() => null)) as {
          ok?: boolean;
          src?: string;
          expiresAt?: string;
          ttlSeconds?: number;
        } | null;
        if (!r.ok || !body || body.ok !== true || typeof body.src !== "string") return false;
        const el = videoRef.current;
        if (el) resumeRef.current = { t: el.currentTime, play: !el.paused };
        currentSrcRef.current = body.src;
        setCurrentSrc(body.src);
        if (typeof body.expiresAt === "string") {
          const next = Date.parse(body.expiresAt);
          expiresRef.current = next;
          setExp(next);
        }
        if (typeof body.ttlSeconds === "number") setTtl(body.ttlSeconds);
        return true;
      } catch {
        return false;
      } finally {
        refreshRef.current = null;
      }
    })();
    refreshRef.current = run;
    return run;
  }, [videoId]);

  /** Cheap probe to tell quota / auth / transient apart before giving up. */
  const diagnose = useCallback(async () => {
    if (fatalRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    let status = 0;
    let workerReason: string | null = null;
    let workerError: string | null = null;
    let workerDriveReason: string | null = null;
    let workerStage: string | null = null;
    try {
      const probe = await fetch(currentSrcRef.current, {
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      });
      status = probe.status;
      const parsed = (await probe.json().catch(() => null)) as
        | { error?: string; reason?: string; drive_reason?: string; stage?: string }
        | null;
      workerError = parsed?.error ?? null;
      workerReason = parsed?.reason ?? null;
      workerDriveReason = parsed?.drive_reason ?? null;
      workerStage = parsed?.stage ?? null;
    } catch {
      /* network failure — treated as transient below */
    }
    // Read the Worker's structured reason (never values) for the debug strip.
    setWorkerInfo({
      workerStatus: status,
      workerReason: workerReason ?? (status >= 400 ? `http_${status}` : null),
      workerDriveReason,
      workerStage,
    });

    if (status === 503 && workerError === "quota") {
      fail("quota");
      return;
    }
    if (status === 401 || status === 403) {
      const refreshed = await refreshToken();
      if (refreshed) return;
      fail("auth");
      return;
    }
    if (status >= 400) {
        // Any other Worker 4xx/5xx: switch to Direct / YouTube immediately.
        fail(`http_${status}`);
        return;
      }
    if (status === 200 || status === 206) {
      // The Worker is healthy — the media error was transient. Reload once.
      errCount.current += 1;
      if (errCount.current <= 1) {
        try {
          el.load();
        } catch {
          /* ignore */
        }
        return;
      }
      fail("error");
      return;
    }
    fail("error");
  }, [fail, refreshToken]);

  // ---- Plyr construction (once) ------------------------------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const player = new Plyr(el, {
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "mute",
        "volume",
        "settings",
        "fullscreen",
      ],
      settings: ["speed"],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      // Native shell: expand/collapse is owned by the page state machine.
      // Web: Plyr's normal fullscreen is used.
      fullscreen: { enabled: true, fallback: !native, iosNative: false },
      hideControls: true,
      clickToPlay: true,
      keyboard: { focused: true, global: false },
      tooltips: { controls: true, seek: true },
      invertTime: false,
      displayDuration: true,
    });
    if (native) {
      player.on("enterfullscreen", () => {
        try { (player.fullscreen as any).exit?.(); } catch {}
        const { onExpand, onCollapse, playerState: ps } = expandCollapseRef.current;
        if (ps === "expanded" || ps === "expanding") onCollapse();
        else onExpand();
      });
    }
    plyrRef.current = player;
    return () => {
      try {
        player.destroy();
      } catch {
        /* already gone */
      }
      plyrRef.current = null;
    };
  }, [native]);

  // ---- Source wiring + watchdog ------------------------------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    fatalRef.current = false;
    errCount.current = 0;
    setReady(false);
    readyRef.current = false;

    if (el.getAttribute("src") !== currentSrc) {
      el.setAttribute("src", currentSrc);
      el.load();
    }

    const resume = resumeRef.current;
    resumeRef.current = null;
    if (resume && resume.t > 0.5) {
      const apply = () => {
        try {
          el.currentTime = resume.t;
          if (resume.play) void el.play().catch(() => undefined);
        } catch {
          /* ignore */
        }
      };
      el.addEventListener("loadedmetadata", apply, { once: true });
    }

    if (canplayTimer.current !== null) window.clearTimeout(canplayTimer.current);
    canplayTimer.current = window.setTimeout(() => {
      if (!readyRef.current) fail("stall");
    }, CANPLAY_TIMEOUT_MS);

    return () => {
      if (canplayTimer.current !== null) window.clearTimeout(canplayTimer.current);
    };
  }, [currentSrc, fail]);

  // ---- Media events -------------------------------------------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const clearCanplay = () => {
      if (canplayTimer.current !== null) {
        window.clearTimeout(canplayTimer.current);
        canplayTimer.current = null;
      }
    };
    const onTime = () => cbRef.current.onProgress(el.currentTime);
    const onSeek = () => cbRef.current.onSeeked(el.currentTime);
    const onMeta = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) cbRef.current.onDuration(d);
    };
    const onCanPlay = () => {
      clearCanplay();
      readyRef.current = true;
      setReady(true);
      setWorkerInfo({});
      // The Worker is healthy — the parent clears its failure marker so the
      // next lesson tries the Worker tier again.
      cbRef.current.onWorkerHealthy?.();
    };
    const onWaiting = () => {
      // Arm the buffering watchdog only once playback has started — it is
      // the longer stall timeout for mid-playback, not the cold-load timer.
      if (readyRef.current) waitStart.current = Date.now();
    };
    const onPlaying = () => {
      waitStart.current = 0;
    };
    const onEndedEvent = () => cbRef.current.onEnded();
    const onError = () => void diagnose();

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onSeek);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("playing", onCanPlay);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("ended", onEndedEvent);
    el.addEventListener("error", onError);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onSeek);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("playing", onCanPlay);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("ended", onEndedEvent);
      el.removeEventListener("error", onError);
    };
  }, [diagnose]);

  // ---- Silent token refresh before expiry --------------------------------
  useEffect(() => {
    if (exp <= 0) return;
    const delay = Math.max(10_000, exp - Date.now() - refreshLeadMs(ttl));
    const id = window.setTimeout(() => {
      void refreshToken();
    }, delay);
    return () => window.clearTimeout(id);
  }, [exp, ttl, refreshToken]);

  // ---- Mid-playback buffering watchdog -----------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      if (waitStart.current > 0 && Date.now() - waitStart.current > STALL_TIMEOUT_MS) {
        waitStart.current = 0;
        fail("stall");
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [fail]);

  // ---- Debug strip (?pvpdebug=1 or long-press) ---------------------------
  useEffect(() => {
    if (!debugVisible) return;
    const id = window.setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      const buffered =
        el.buffered.length > 0
          ? `${el.buffered.start(0).toFixed(1)}-${el.buffered.end(el.buffered.length - 1).toFixed(1)}`
          : "-";
      const ttl =
        expiresRef.current > 0
          ? `${Math.max(0, Math.round((expiresRef.current - Date.now()) / 1000))}s`
          : "-";
      setDbg({
        tier: "worker",
        dims: `${el.videoWidth}x${el.videoHeight}`,
        readyState: el.readyState,
        buffered,
        currentTime: el.currentTime.toFixed(1),
        errorCode: el.error?.code ?? 0,
        tokenTtl: ttl,
        workerFailMarkerAgeMs: workerFailAgeMs(videoId),
        ...workerInfo,
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [debugVisible, videoId, workerInfo]);

  const startPress = () => {
    if (debugOn) return;
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setDebugLocal(true), 700);
  };
  const endPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const expanded = playerState === "expanded";
  const covering = playerState === "expanding" || playerState === "collapsing";
  const insets = safeInsets();

  return (
    <div
      ref={wrapRef}
      dir="ltr"
      className={`pvp pvp-worker${native ? " pvp-native" : ""} relative w-full overflow-hidden outline-none select-none ${
        expanded ? "pvp-expanded rounded-none" : "aspect-video rounded-[20px]"
      }`}
      style={
        expanded
          ? { position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 9999, background: "#000", overscrollBehavior: "contain", touchAction: "none" }
          : { background: "#000" }
      }
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      aria-label="Protected video player"
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        style={{ background: "#000" }}
      />

      {watermark}

      {native && !expanded ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Open full screen"
          style={{ position: "absolute", top: insets.top + 8, left: insets.left + 8, zIndex: 40 }}
          className="grid h-11 w-11 place-items-center rounded-full border border-[rgba(255,255,255,0.35)] bg-[rgba(0,0,0,0.35)] text-white shadow-[0_2px_10px_rgba(0,0,0,0.4)] transition hover:bg-[rgba(255,255,255,0.2)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="16" y1="9" x2="9" y2="16" />
          </svg>
        </button>
      ) : null}

      {native && expanded ? (
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Close full screen"
          style={{ position: "absolute", top: insets.top + 8, right: insets.right + 8, zIndex: 60 }}
          className="grid h-11 w-11 place-items-center rounded-full bg-[rgba(0,0,0,0.6)] text-white shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}

      {covering && <div aria-hidden="true" className="absolute inset-0 z-30 bg-black" />}

      {!ready && !covering && (
        <div
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
          style={{ background: "rgba(0,0,0,0.35)" }}
          aria-label="loading"
        >
          <span
            aria-hidden="true"
            className="h-12 w-12 animate-spin rounded-full"
            style={{ border: "4px solid rgba(255,255,255,0.25)", borderTopColor: "#3BBCD9" }}
          />
        </div>
      )}

      {debugVisible && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 100000,
            pointerEvents: "none",
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            fontSize: 10,
            fontFamily: "monospace",
            padding: 4,
            maxWidth: 420,
            whiteSpace: "pre",
          }}
        >
          {Object.entries(dbg)
            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
            .join("\n")}
        </div>
      )}
    </div>
  );
}
