import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { directSrcHost } from "../lib/driveBrowser";
import "./directPlayer.css";
import type { WorkerPlayerState } from "./WorkerVideoPlayer";

/** The Direct Drive tier: Plyr around a real <video> whose src is the Drive
 *  API URL (no Worker, no token, no auth, no Supabase). Diagnoses failures
 *  by probing with a one-off Range request and reports them via onFatal so
 *  the chain falls to YouTube immediately. */

const CANPLAY_TIMEOUT_MS = 12_000;
const STALL_TIMEOUT_MS = 15_000;

type DirectPlayerProps = {
  src: string;
  /** The chain is switching away — never used by the video itself. */
  onFatal: (reason: string) => void;
  native: boolean;
  /** Identity watermark — REQUIRED by the product rules on every tier. */
  watermark?: ReactNode;
  /** ?pvpdebug=1 only: the diagnostic strip must never show to a student. */
  debugOn?: boolean;
  playerState: WorkerPlayerState;
  onExpand: () => void;
  onCollapse: () => void;
  safeInsets: () => { top: number; right: number; bottom: number; left: number };
};

export function DirectDriveVideoPlayer({
  src,
  onFatal,
  native,
  watermark,
  debugOn = false,
  playerState,
  onExpand,
  onCollapse,
  safeInsets,
}: DirectPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const failedRef = useRef(false);
  const expandCollapseRef = useRef({ onExpand, onCollapse, playerState });
  expandCollapseRef.current = { onExpand, onCollapse, playerState };
  const onFatalRef = useRef(onFatal);
  const readyRef = useRef(false);
  const canplayAtRef = useRef(0);
  const [lastFailure, setLastFailure] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ status: number | null; reason: string | null }>({
    status: null,
    reason: null,
  });
  const [dbg, setDbg] = useState<Record<string, unknown>>({});

  useEffect(() => {
    onFatalRef.current = onFatal;
  });

  const fail = useCallback((reason: string) => {
    if (failedRef.current) return;
    failedRef.current = true;
    setLastFailure(reason);
    onFatalRef.current(reason);
  }, []);

  // Diagnose: probe the Drive API with a one-off Range request and classify
  // the failure — 403/429 means permission/quota, anything else means error.
  const diagnose = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    let status: number | null = null;
    let reason: string | null = null;
    try {
      const r = await fetch(src, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
      status = r.status;
      if (status === 403 || status === 429) reason = `drive_${status}`;
    } catch {
      status = null;
      reason = "network";
    }
    setProbe({ status, reason });
    fail(reason ?? "error");
  }, [fail, src]);

  // Plyr construction (once per native flag — same pattern as WorkerVideoPlayer).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const player = new Plyr(el, {
      controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "settings", "fullscreen"],
      settings: ["speed"],
      // Native shell: expand/collapse is owned by the page state machine.
      // Web: Plyr's normal fullscreen is used.
      fullscreen: { enabled: true, fallback: !native, iosNative: false },
      hideControls: false,
      clickToPlay: true,
      keyboard: { focused: true, global: false },
    });
    if (native) {
      player.on("enterfullscreen", () => {
        try { (player.fullscreen as any).exit?.(); } catch {}
        const { onExpand, onCollapse, playerState: ps } = expandCollapseRef.current;
        if (ps === "expanded" || ps === "expanding") onCollapse();
        else onExpand();
      });
    }
    return () => {
      try {
        player.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [native]);

  // Media events.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let canplayTimer: number | null = null;
    let stallTimer: number | null = null;
    let waitsSince = 0;
    const onCanPlay = () => {
      readyRef.current = true;
      canplayAtRef.current = Date.now();
      if (canplayTimer !== null) {
        window.clearTimeout(canplayTimer);
        canplayTimer = null;
      }
    };
    const onWaiting = () => {
      if (!readyRef.current) waitsSince = Date.now();
    };
    const onPlaying = () => {
      waitsSince = 0;
    };
    const onError = () => void diagnose();
    const onTime = () => {
      if (!readyRef.current) return;
      const el2 = videoRef.current;
      if (el2) setDbg((d) => ({ ...d, currentTime: el2.currentTime }));
    };
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("error", onError);
    el.addEventListener("timeupdate", onTime);

    // Not-yet-ready watchdog: no canplay within CANPLAY_TIMEOUT_MS → stall.
    canplayTimer = window.setTimeout(() => {
      if (!readyRef.current) fail("stall");
    }, CANPLAY_TIMEOUT_MS);
    // Buffering watchdog: armed while playing, stalled > STALL_TIMEOUT_MS.
    stallTimer = window.setInterval(() => {
      if (waitsSince && Date.now() - waitsSince > STALL_TIMEOUT_MS) fail("stall");
    }, 2000);

    return () => {
      if (canplayTimer !== null) window.clearTimeout(canplayTimer);
      if (stallTimer !== null) window.clearInterval(stallTimer);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("error", onError);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [diagnose, fail]);

  // Debug strip — the last failure reason stays visible after the fallback.
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      const buffered =
        el.buffered.length > 0
          ? `${el.buffered.start(0).toFixed(1)}-${el.buffered.end(el.buffered.length - 1).toFixed(1)}`
          : "-";
      setDbg({
        tier: "direct",
        host: directSrcHost(src),
        dims: `${el.videoWidth}x${el.videoHeight}`,
        readyState: el.readyState,
        networkState: el.networkState,
        buffered,
        currentTime: el.currentTime.toFixed(1),
        lastFailure,
        probe,
        errorCode: el.error?.code ?? 0,
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [src, lastFailure, probe]);

  const expanded = playerState === "expanded";
  const insets = safeInsets();

  return (
    <div
      ref={boxRef}
      dir="ltr"
      /* aspect-video is NOT cosmetic: every child is absolutely positioned, so
         without an explicit box the container has zero height and the player
         is invisible — which reads to a student as "the video disappeared". */
      className={`pvp pvp-direct relative w-full overflow-hidden outline-none select-none ${
        expanded ? "pvp-expanded fixed inset-0 z-[70] bg-black" : "aspect-video rounded-[20px] bg-black"
      }`}
      style={
        expanded
          ? {
              background: "#000",
              paddingTop: insets.top,
              paddingRight: insets.right,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
            }
          : { background: "#000" }
      }
      aria-label="Protected video player"
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
      />
      {watermark}
      {debugOn && (
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
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
            .join("\n")}
        </div>
      )}
    </div>
  );
}
