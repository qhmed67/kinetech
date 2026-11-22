/** Standalone Player Test page — hidden, unlinked: open as
 *  `<preview>/#/player-test[?fid=<driveFileId>]`.
 *
 * Renders ONLY a Plyr-wrapped <video> playing the Drive API URL directly
 * (no Cloudflare Worker, no token, no auth, no Supabase):
 *   src = https://www.googleapis.com/drive/v3/files/<id>?alt=media&key=<VITE_DRIVE_BROWSER_KEY>&supportsAllDrives=true
 *
 * The test file constant defaults to 1a0p37O-VASxkdXIt-smWK3tw0x9-Tp7Y
 * (not a secret — it is a shared, public MP4).
 *
 * Also: the native watermark overlay + expand/orientation bridge, so the
 * phone behaviour can be exercised, and an always-visible debug strip
 * (src host — never the key — video dims, readyState, buffered ranges,
 * currentTime, error code+message, time-to-metadata, time-to-canplay,
 * seeks, and a one-off Range probe status: 206 vs 403 vs network).
 *
 * No /api/play is called and no Supabase is touched — the whole point is
 * a clean, zero-auth path to see what the Drive API returns to the page.
 */
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { useEffect, useRef, useState } from "react";
import { bridgeOn, isNativeApp } from "../native";
import { directDriveUrl, directSrcHost } from "../lib/driveBrowser";
import "../components/workerPlayer.css";

export const PLAYER_TEST_FILE_ID = "1a0p37O-VASxkdXIt-smWK3tw0x9-Tp7Y";

type TestDebug = {
  srcHost: string;
  "videoWidth×videoHeight": string;
  readyState: number;
  networkState: number;
  buffered: string;
  currentTime: string;
  errorCode: number;
  errorMessage: string;
  timeToLoadedMetadata: number | null;
  timeToCanplay: number | null;
  seeks: number;
  probe: string;
};

function PlayerTestShell({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-4" aria-label="player test">
      <div className="max-w-2xl rounded-xl border border-white/10 bg-black p-6 text-sm text-white">{message}</div>
    </main>
  );
}

/** Plyr-wrapped <video> + debug strip + watermark + native expand bridge. */
function PlayerTestVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAtRef = useRef(0);
  const seeksRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [coverOn, setCoverOn] = useState(false);
  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);
  const [dbg, setDbg] = useState<TestDebug>({
    srcHost: directSrcHost(src),
    "videoWidth×videoHeight": "0×0",
    readyState: 0,
    networkState: 0,
    buffered: "-",
    currentTime: "0.0",
    errorCode: 0,
    errorMessage: "",
    timeToLoadedMetadata: null,
    timeToCanplay: null,
    seeks: 0,
    probe: "…",
  });

  // ---- Plyr (same options as the production players) -----------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const player = new Plyr(el, {
      controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "settings", "fullscreen"],
      settings: ["speed"],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      fullscreen: { enabled: true, fallback: true, iosNative: false },
      hideControls: false,
      clickToPlay: true,
      keyboard: { focused: true, global: false },
      invertTime: false,
      displayDuration: true,
    });
    return () => {
      try {
        player.destroy();
      } catch {
        /* already gone */
      }
    };
  }, []);

  // ---- Media events + debug state ------------------------------------------
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const update = (patch: Partial<TestDebug>) => setDbg((d) => ({ ...d, ...patch }));
    const onLoadedMetadata = () => update({ timeToLoadedMetadata: Date.now() - startedAtRef.current });
    const onCanPlay = () => update({ timeToCanplay: Date.now() - startedAtRef.current });
    const onSeeked = () => {
      seeksRef.current += 1;
      update({ seeks: seeksRef.current });
    };
    const onError = () =>
      update({ errorCode: el.error?.code ?? 0, errorMessage: el.error?.message ?? "" });
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("playing", onCanPlay);
    el.addEventListener("seeked", onSeeked);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("playing", onCanPlay);
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("error", onError);
    };
  }, []);

  // One-off Range probe — the status the user wants to see (206/403/network).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(src, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
        if (!cancelled) setDbg((d) => ({ ...d, probe: String(r.status) }));
      } catch {
        if (!cancelled) setDbg((d) => ({ ...d, probe: "network" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // ---- Debug strip poll ------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      const buffered =
        el.buffered.length > 0
          ? `${el.buffered.start(0).toFixed(1)}-${el.buffered.end(el.buffered.length - 1).toFixed(1)}`
          : "-";
      setDbg((d) => ({
        ...d,
        "videoWidth×videoHeight": `${el.videoWidth}×${el.videoHeight}`,
        readyState: el.readyState,
        networkState: el.networkState,
        buffered,
        currentTime: el.currentTime.toFixed(1),
        errorCode: el.error?.code ?? 0,
        errorMessage: el.error?.message ?? "",
      }));
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // ---- Native expand + orientation bridge ------------------------------------
  useEffect(() => {
    if (!isNativeApp()) return;
    try {
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({ v: 1, type: "player-fullscreen", expanded }),
      );
    } catch {
      /* bridge not ready */
    }
  }, [expanded]);
  useEffect(() => {
    const off1 = bridgeOn("player-orientation-settled", () => setExpanded(true));
    const off2 = bridgeOn("closeExpand", () => setExpanded(false));
    return () => {
      off1();
      off2();
    };
  }, []);

  const expandedView = expanded;

  return (
    <div
      dir="ltr"
      className={`pvp pvp-worker relative w-full overflow-hidden outline-none select-none ${
        expandedView ? "rounded-none" : "aspect-video rounded-[20px]"
      }`}
      style={
        expandedView
          ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "#000" }
          : { background: "#000" }
      }
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
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
        style={{ background: "#000" }}
      />

      {/* Watermark overlay (same visual style as the production players). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-20 max-w-[70%] truncate rounded-lg px-3 py-1.5 text-xs font-bold"
        style={{
          top: 12,
          right: 12,
          background: "rgba(0,0,0,0.45)",
          color: "rgba(255,255,255,0.85)",
          fontFamily: "var(--font-display)",
        }}
      >
        Kinetech · player test
      </div>

      {coverOn && <div aria-hidden="true" className="absolute inset-0 z-30 bg-black" />}

      {/* Debug strip — ALWAYS visible. Shows the src host only (never the key). */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 8,
          left: 8,
          zIndex: 100000,
          pointerEvents: "none",
          background: "rgba(0,0,0,0.85)",
          color: "#fff",
          fontSize: 10,
          fontFamily: "monospace",
          padding: 4,
          maxWidth: 480,
          whiteSpace: "pre",
        }}
      >
        {Object.entries(dbg)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")}
      </div>

      {isNativeApp() && !expandedView ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            setCoverOn(true);
          }}
          aria-label="Open full screen"
          style={{ position: "absolute", top: 12, left: 12, zIndex: 40 }}
          className="grid h-11 w-11 place-items-center rounded-full border border-[rgba(255,255,255,0.35)] bg-[rgba(0,0,0,0.35)] text-white shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="16" y1="9" x2="9" y2="16" />
          </svg>
        </button>
      ) : null}

      {isNativeApp() && expandedView ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setCoverOn(false);
          }}
          aria-label="Close full screen"
          style={{ position: "absolute", top: 12, right: 12, zIndex: 60 }}
          className="grid h-11 w-11 place-items-center rounded-full bg-[rgba(0,0,0,0.6)] text-white shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function PlayerTestPage({ fid: fidParam }: { fid?: string }) {
  const key = import.meta.env.VITE_DRIVE_BROWSER_KEY ?? "";
  if (key.trim() === "") {
    return (
      <PlayerTestShell
        message="VITE_DRIVE_BROWSER_KEY is not set on this environment — set it on the Vercel Preview project and redeploy to enable this page."
      />
    );
  }
  const fid = (fidParam ?? PLAYER_TEST_FILE_ID).trim() || PLAYER_TEST_FILE_ID;
  const src = directDriveUrl(fid, key);
  if (!src) {
    return <PlayerTestShell message={`Could not build the Drive URL for "${fid}" (missing file id or key).`} />;
  }
  return <PlayerTestVideo src={src} />;
}

export default PlayerTestPage;
