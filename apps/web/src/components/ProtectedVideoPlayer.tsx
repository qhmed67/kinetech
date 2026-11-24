import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { bridgeOn, bridgeSend, isNativeApp } from "../native";
import { useLang } from "./lang";
import { apiFetch } from "../lib/http";
import { getAccessToken } from "../lib/accessToken";
import { log } from "../lib/logger";
import { notifyUpdateRequired } from "../lib/appGate";
import { useScrollLock } from "../lib/useScrollLock";
import { WorkerVideoPlayer } from "./WorkerVideoPlayer";
import { DirectDriveVideoPlayer } from "./DirectDriveVideoPlayer";
import { directDriveUrl } from "../lib/driveBrowser";
import {
  isWorkerFailFresh,
  clearWorkerFailMarker,
  setWorkerFailMarker,
  workerFailAgeMs,
} from "../lib/workerFailMarker";
import {
  INITIAL_TIER_STATE,
  tierReducer,
  nextTierAfterFailure,
  isDriveLessonEmbed,
  lessonIsDrive,
  isTerminal,
  type LessonTier,
  type TierEvent,
} from "../lib/playerTiers";
import {
  YT_STATE,
  extractYoutubeId,
  formatClock,
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
  /** "worker" = a <video> streamed through the Worker; "direct" = a <video>
   *  playing the Drive API URL directly; "embed" = YouTube/mp4 stored link. */
  mode: "worker" | "direct" | "embed";
  /** Worker stream URL (signed token, no Drive id). Present when mode=worker. */
  src?: string;
  /** ISO expiry of the current Worker token. */
  expiresAt?: string;
  /** Lifetime of the current Worker token in seconds (the server decides it).
   *  The player uses it to schedule the silent refresh before expiry. */
  ttlSeconds?: number;
  /** Whether the Direct Drive tier is available at all (admin toggle). */
  directAvailable?: boolean;
  /** Whether a YouTube fallback exists for this lesson. */
  youtubeAvailable?: boolean;
  /** The lesson's source is a Google Drive file (decided once, from the
   *  initial grant). It stays true after the YouTube swap so the player keeps
   *  using the Drive-lesson branches instead of the plain <video> one. */
  isDrive?: boolean;
  /** Agent: views left after the grant, for the debug strip only. */
  viewsLeft?: number;
  /** Direct Drive tier (Priority 2): set by the /api/play fallback=direct
   *  response. The key is served by the server from DRIVE_BROWSER_KEY. */
  driveFileId?: string;
  directKey?: string;
  directSrc?: string;
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

/** Explicit player overlay state machine (native shell only). */
type PlayerState = "inline" | "expanding" | "expanded" | "collapsing" | "inline";

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
 * The raw Drive/YouTube URL never sits in props, state, or the DOM — Drive
 * plays through the Worker or the Direct tier, YouTube through Google's
 * frame with zero native chrome + custom bar.
 *
 * Honest limits: the Drive FILE ID is visible in the browser at playback
 * time (the Direct URL, network tab), and screen recording cannot be
 * blocked by any website technology. Real protection stays server-side
 * (single session, enrollment + 3-view cap + rate/suspicion rules,
 * watermarked identity).
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
  // Inside the native shell the page never plays protected media itself: it
  // asks native to play the lesson (the native side owns the grant, the DRM
  // licence and the watermark). In a browser nothing changes.
  const native = isNativeApp();
  const { t } = useLang();

  // Play grant from the server; null until /api/play answers.
  const [grant, setGrant] = useState<PlayGrant | null>(null);
  // Active playback tier, driven ONLY by the reducer in lib/playerTiers.
  // Worker → Direct → YouTube → terminal, forward-only. The component never
  // picks the next tier itself: it reports outcomes and renders what the
  // machine names, so a tier cannot be skipped or silently stranded.
  const [tierState, dispatchTier] = useReducer(tierReducer, INITIAL_TIER_STATE);
  const tier: LessonTier = tierState.tier;
  // Every /api/play call is counted so the debug strip can show how many grants
  // a single lesson consumed (the "several calls per click" symptom).
  const playCallsRef = useRef(0);
  // Terminal (denied/session-dead): parent takes over the area.
  const [over, setOver] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Poster covers the unstarted frame (where YouTube shows title/avatar).
  const [started, setStarted] = useState(false);
  // Poster gate for native elements (mp4 / HLS seeds need an explicit start).
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
  const mediaRef = useRef<HTMLVideoElement>(null);

  // Watermark drift.
  useEffect(() => {
    const id = window.setInterval(
      () => setSpot((s) => (s + 1 + Math.floor(Math.random() * (WM_SPOTS.length - 1))) % WM_SPOTS.length),
      15000,
    );
    return () => window.clearInterval(id);
  }, []);

  /** Direct Drive tier: /api/play {fallback:"direct"} — a read-only,
   *  no-view-count call. Returns the Drive file id + the browser key
   *  (from the DRIVE_BROWSER_KEY server env var). On any failure the
   *  chain falls to YouTube via tierAfterDirectFailure(). */
  const loadDirect = useCallback(
    async (opts: { canDirect: boolean; youtubeAvailable: boolean }) => {
    const token = await getAccessToken();
    if (!token) {
      dispatchTier({ type: "TIER_FAILED", reason: "no_token", ...opts });
      return;
    }
    try {
      playCallsRef.current += 1;
      const r = await apiFetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: videoId, fallback: "direct" }),
      });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean;
        mode?: string;
        driveFileId?: string;
        key?: string;
        youtubeAvailable?: boolean;
      } | null;
      const directSrc =
        body && body.mode === "direct" ? directDriveUrl(body.driveFileId ?? "", body.key ?? "") : null;
      if (!r.ok || !body || body.mode !== "direct" || directSrc === null) {
        const reason = !r.ok ? `direct_http_${r.status}` : "direct_unavailable";
        dispatchTier({ type: "TIER_FAILED", reason, ...opts });
        return;
      }
      log("warn", "player.tier_fallback", "worker tier failed — direct drive", {
        module: "player",
        ctx: { from: "worker", to: "direct" },
      });
      setGrant((g) =>
        g
          ? { ...g, mode: "direct", driveFileId: body.driveFileId, directKey: body.key, directSrc }
          : g,
      );
      // The grant now carries a playable Direct src; the machine transition
      // already happened when the Worker failed, so there is nothing to set.
    } catch {
      dispatchTier({ type: "TIER_FAILED", reason: "direct_network", ...opts });
    }
    },
    [videoId],
  );

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
    gotQualities.current = false;
    setQualities([]);
    setQuality("auto");
    qualityMarks.current = [{ t: 0, q: "auto" }];
    levelsRef.current = [];
    setTime(0);
    setDur(0);
    lastPoll.current = 0;
    endedRef.current = false;
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
        playCallsRef.current += 1;
        const r = await apiFetch("/api/play", {
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
          embedUrl?: string; minutes?: number; mode?: string; src?: string;
          expiresAt?: string; ttlSeconds?: number; directAvailable?: boolean;
          youtubeAvailable?: boolean;
          watermark?: { email?: string; phoneLast4?: string };
        } | null;
        if (!alive) return;
        if (!r.ok || !body || body.ok !== true || typeof body.embedUrl !== "string") {
          const code = typeof body?.code === "string" ? body.code : "";
          if (r.status === 426 || code === "APP_001") {
            // The app build is older than the minimum supported version:
            // show the web-layer update screen (hosted on Vercel, so even an
            // old shell renders the new screen).
            notifyUpdateRequired({
              ar: typeof body?.ar === "string" ? body.ar : "",
              en: typeof body?.en === "string" ? body.en : "",
              minSupportedVersion:
                typeof (body as { min_supported_version?: unknown } | null)?.min_supported_version === "string"
                  ? String((body as { min_supported_version?: string }).min_supported_version)
                  : "",
            });
          }
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
          mode: body.mode === "worker" && typeof body.src === "string" ? "worker" : "embed",
          src: typeof body.src === "string" ? body.src : undefined,
          expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : undefined,
          ttlSeconds: typeof body.ttlSeconds === "number" ? body.ttlSeconds : undefined,
          youtubeAvailable: body.youtubeAvailable === true,
          viewsLeft: typeof (body as { viewsLeft?: unknown }).viewsLeft === "number"
            ? (body as { viewsLeft: number }).viewsLeft
            : undefined,
          // Decided here, once, from the ORIGINAL embed. The chain later swaps
          // embedUrl for a YouTube link; isDrive must survive that swap.
          isDrive: isDriveLessonEmbed(body.embedUrl, extractYoutubeId(body.embedUrl)),
        });
        const workerActive = body.mode === "worker" && typeof body.src === "string";
        const freshMarker = isWorkerFailFresh(videoId);
        // The server tells us whether the Direct Drive tier exists at all.
        // When it is switched off the chain must not even ask for it.
        const directAvailable = body.directAvailable !== false;
        const hasDriveFile =
          isDriveLessonEmbed(body.embedUrl, extractYoutubeId(body.embedUrl)) && directAvailable;
        const youtubeAvailable = body.youtubeAvailable === true;
        // ONE decision, from the machine. A Drive lesson without a Worker
        // grant now starts on Direct instead of jumping to YouTube.
        const g: TierEvent = {
          type: "GRANT",
          workerMode: workerActive,
          workerSrc: workerActive,
          markerFresh: freshMarker,
          hasDriveFile,
          youtubeAvailable,
        };
        const startTier = tierReducer(INITIAL_TIER_STATE, g).tier;
        dispatchTier(g);
        if (startTier === "direct") {
          // Direct needs a separate (read-only) grant for the key + file id.
          void loadDirect({ canDirect: hasDriveFile, youtubeAvailable });
        }
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
  }, [videoId, loadDirect]);

  // isYt is derived from the LIVE grant, so a Drive lesson changes classification
  // once loadYoutubeFallback swaps in the youtube-nocookie embed.
  const embedUrl = grant?.embedUrl ?? null;
  const isYt = embedUrl !== null && extractYoutubeId(embedUrl) !== null;
  // "Drive lesson" is a property of the LESSON (the grant opened a Drive
  // source), never of the current embed: after the YouTube swap the embed is a
  // YouTube link, and re-deriving it from the embed would drop the lesson into
  // the plain `!isYt` native <video> branch and break playback.
  const isDrive = lessonIsDrive(grant?.isDrive, embedUrl);
  // A Drive lesson. The Drive URL never reaches the DOM — the chain renders
  // it via Worker or Direct, and via YouTube once Direct dies (the YouTube
  // render branch below). Non-YouTube non-Drive embeds are natively playable.
  const nativelyPlayable = embedUrl !== null && !isYt && !isDrive;

  // ---- Tier fallback chain: Worker → Direct → YouTube ---------------------
  // Every switch is forward-only and logged WITHOUT ids or URLs.
  const loadYoutubeFallback = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setFailed(true);
      return;
    }
    try {
      playCallsRef.current += 1;
      const r = await apiFetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: videoId, fallback: "youtube" }),
      });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean;
        embedUrl?: string;
      } | null;
      if (!r.ok || !body || body.ok !== true || typeof body.embedUrl !== "string") {
        setFailed(true);
        return;
      }
      log("warn", "player.tier_fallback", "switched to the youtube fallback", {
        module: "player",
        ctx: { from: tier, to: "youtube" },
      });
      const ytEmbed = body.embedUrl;
      setGrant((g) => (g ? { ...g, embedUrl: ytEmbed, mode: "embed" } : g));
      // The machine is already on the youtube tier; the embed arriving is
      // what makes that tier renderable (isYt below).
    } catch {
      setFailed(true);
    }
  }, [videoId, tier]);

  const onWorkerFatal = useCallback(
    (reason: string) => {
      log("warn", "player.tier_fallback", "worker tier failed", {
        module: "player",
        ctx: { from: "worker", to: "direct", reason },
      });
      // Mark the Worker as failing: later lessons skip straight to Direct.
      // (The marker is cleared when the Worker is healthy again.)
      setWorkerFailMarker(videoId);
      // The machine decides the next tier (Direct when the lesson has a Drive
      // file, YouTube otherwise, terminal only when nothing is left).
      const opts = { canDirect: isDrive, youtubeAvailable: grant?.youtubeAvailable === true };
      dispatchTier({ type: "TIER_FAILED", reason, ...opts });
      const next = nextTierAfterFailure("worker", opts);
      if (next === "direct") void loadDirect(opts);
    },
    [videoId, loadDirect, isDrive, grant],
  );

  /** Direct Drive tier died (video.error, 403/429, or no canplay) → YouTube. */
  const onDirectFatal = useCallback(
    (reason: string) => {
      log("warn", "player.tier_fallback", "direct tier failed", {
        module: "player",
        ctx: { from: "direct", to: "youtube", reason },
      });
      debugRef.current.lastTierFailure = { from: "direct", to: "youtube", reason };
      dispatchTier({
        type: "TIER_FAILED",
        reason,
        canDirect: false,
        youtubeAvailable: grant?.youtubeAvailable === true,
      });
    },
    [grant],
  );

  // Direct died on a Drive lesson that has a YouTube version: fetch the
  // YouTube embed now. One attempt per lesson — the chain is forward-only
  // and never loops. ytBusy keeps the error screen off while the fetch runs
  // (without it the player flips to "Video unavailable" before the embed
  // lands).
  const [ytBusy, setYtBusy] = useState(false);
  const ytFetchRef = useRef(false);
  useEffect(() => {
    if (tier !== "youtube" || !isDrive || !grant?.youtubeAvailable || isYt) return;
    if (ytFetchRef.current) return;
    ytFetchRef.current = true;
    setYtBusy(true);
    void loadYoutubeFallback().finally(() => setYtBusy(false));
  }, [tier, isDrive, grant, isYt, loadYoutubeFallback]);

  // The chain has run out of tiers.
  //  - No YouTube version to fall to: error.
  //  - YouTube version exists but its embed could not be fetched: error.
  // Only reached once the fetch settled, never while it is still in flight.
  useEffect(() => {
    if (tier !== "youtube" || !isDrive || ytBusy) return;
    if (!grant?.youtubeAvailable || !isYt) setFailed(true);
  }, [tier, isDrive, ytBusy, isYt, grant]);

  // The native shell floats the student's identity over the playback. The
  // page already knows it from the server grant, so it hands it over — the
  // native side never asks for a second grant (that would burn a view).
  useEffect(() => {
    if (!native || !grant) return;
    bridgeSend({
      v: 1,
      type: "watermark",
      email: grant.email,
      phoneLast4: grant.phoneLast4,
    });
    // When the player goes away the native layer drops the overlay again.
    return () => {
      bridgeSend({ v: 1, type: "watermark", email: "", phoneLast4: "" });
    };
  }, [native, grant]);

  // ---- Native shell (Expo Go) expand/collapse state machine ----------------
  const [playerState, setPlayerState] = useState<PlayerState>("inline");
  const playerStateRef = useRef<PlayerState>("inline");
  useEffect(() => { playerStateRef.current = playerState; }, [playerState]);
  // Lock page scroll while the native overlay is expanded/transitioning.
  useScrollLock(native && playerState !== "inline");
  const [coverOn, setCoverOn] = useState(false);
  const [coverFadeOut, setCoverFadeOut] = useState(false);
  const seqRef = useRef(0);
  const stabilityRef = useRef<{ key: string; count: number } | null>(null);
  const debugRef = useRef<Record<string, unknown>>({});
  // Inline baseline (before expand), compared after collapse to detect a
  // layout that drifted back (intermittent broken state).
  const inlineBaselineRef = useRef<{ cw: number; ch: number } | null>(null);
  const debugOn =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("pvpdebug");

  // Safe-area values the shell injects as window.__KT_SAFE_AREA (RN
  // useSafeAreaInsets at the root View). The WebView page has no other source
  // of them; CSS env() vars are not set there.
  const safeInsets = () => {
    const anyWindow = window as Window & {
      __KT_SAFE_AREA?: { top: number; right: number; bottom: number; left: number };
    };
    const a = anyWindow.__KT_SAFE_AREA;
    return { top: a?.top ?? 0, right: a?.right ?? 0, bottom: a?.bottom ?? 0, left: a?.left ?? 0 };
  };

  // Page → native: announces the expanded overlay (shell locks landscape,
  // hides the status bar, and lets the hardware back button collapse first).
  const sendPlayerFullscreen = useCallback(
    (value: boolean) => {
      if (!native) return;
      const el = window.ReactNativeWebView;
      if (!el?.postMessage) return;
      try {
        el.postMessage(JSON.stringify({ type: "player-fullscreen", expanded: value }));
      } catch {
        /* bridge not ready / closed — nothing we can do */
      }
    },
    [native],
  );

  // Measure the real container box — the single source of truth for the fit.
  const measureContainer = () => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
    const st = stabilityRef.current;
    stabilityRef.current = st?.key === key ? { key, count: st.count + 1 } : { key, count: 1 };
  };

  // Inline expectation (collapse completion): the shell is back in
  // document flow — not pvp-expanded, not fixed — its width equals the
  // parent content width, and its aspect is ~16:9 (±5%).
  const isInlineExpectationMet = () => {
    const box = boxRef.current;
    if (!box) return false;
    const r = box.getBoundingClientRect();
    const parent = box.parentElement;
    if (!parent || r.width <= 0) return false;
    if (box.classList.contains("pvp-expanded")) return false;
    if (box.style.position.includes("fixed")) return false;
    if (Math.abs(r.width - parent.clientWidth) > Math.max(1, parent.clientWidth * 0.02)) return false;
    if (r.height <= 0 || Math.abs((r.width / r.height) - 16 / 9) / (16 / 9) > 0.05) return false;
    return true;
  };

  // Native → page: the shell asks us to collapse (hardware back button).
  const collapse = useCallback(() => {
    const ps = playerStateRef.current;
    if (ps === "inline" || ps === "collapsing") return;
    playerStateRef.current = "collapsing";
    const seq = ++seqRef.current;
    setPlayerState("collapsing");
    sendPlayerFullscreen(false);
    const start = Date.now();
    const poll = () => {
      if (seqRef.current !== seq) return;
      // Collapse finishes when the WebView is back to portrait: flip the
      // shell to inline.
      if (window.innerWidth > window.innerHeight === false) {
        playerStateRef.current = "inline";
        setPlayerState("inline");
        debugRef.current.inlineExpectationMet = isInlineExpectationMet();
        finish();
        return;
      }
      if (Date.now() - start > 1500) {
        finish();
        return;
      }
      requestAnimationFrame(poll);
    };
    const finish = () => {
      playerStateRef.current = "inline";
      setPlayerState("inline");
      // Compare the restored inline rect against the pre-expand baseline.
      const box0 = boxRef.current;
      if (box0) {
        const r0 = box0.getBoundingClientRect();
        const b = inlineBaselineRef.current;
        debugRef.current.inlineBaseline = b ? { cw: b.cw, ch: b.ch } : null;
        debugRef.current.inlineAfterCollapse = { cw: r0.width, ch: r0.height };
        if (
          b &&
          (Math.abs(r0.width - b.cw) > Math.max(2, b.cw * 0.02) ||
            Math.abs(r0.height - b.ch) > Math.max(2, b.ch * 0.02))
        ) {
          debugRef.current.inlineDrift = true;
        }
      }
      inlineBaselineRef.current = null;
      // Fade the black cover out over ~150 ms, then detach it.
      setTimeout(() => {
        setCoverFadeOut(true);
        setTimeout(() => setCoverOn(false), 150);
        setTimeout(() => setCoverFadeOut(false), 400);
      }, 150);
    };
    requestAnimationFrame(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState, sendPlayerFullscreen]);

  const expand = useCallback(() => {
    const ps = playerStateRef.current;
    if (ps !== "inline") return;
    playerStateRef.current = "expanding";
    const seq = ++seqRef.current;
    setPlayerState("expanding");
    setCoverOn(true);
    setCoverFadeOut(false);
    // Record the inline baseline for the post-collapse comparison.
    const box0 = boxRef.current;
    if (box0) {
      const r0 = box0.getBoundingClientRect();
      inlineBaselineRef.current = { cw: r0.width, ch: r0.height };
    }
    const start = Date.now();
    const poll = () => {
      if (seqRef.current !== seq) return;
      if (window.innerWidth > window.innerHeight) {
        // Re-measure now: the shell is full-window by the time we flip to
        // "expanded" — the frame fit follows the real box.
        measureContainer();
        playerStateRef.current = "expanded";
        setPlayerState("expanded");
        return;
      }
      if (Date.now() - start > 1500) {
        measureContainer();
        playerStateRef.current = "expanded";
        setPlayerState("expanded");
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState]);

  // Cover removal while expanded: wait until orientation is right AND the
  // rect is stable (2 consecutive measures), plus a 1500 ms hard timeout.
  useEffect(() => {
    if (playerState !== "expanded") return;
    const id = setInterval(() => {
      const st = stabilityRef.current;
      if (st && st.count >= 2) removeCover();
    }, 100);
    const t = setTimeout(removeCover, 1500);
    return () => { clearInterval(id); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState]);

  const removeCover = useCallback(() => {
    setCoverFadeOut(true);
    setTimeout(() => setCoverOn(false), 150);
    setTimeout(() => setCoverFadeOut(false), 400);
  }, []);

  // Announce/unannounce the overlay to the shell on every state change, and
  // on unmount.
  useEffect(() => {
    sendPlayerFullscreen(playerState !== "inline");
  }, [playerState, sendPlayerFullscreen]);

  useEffect(() => () => sendPlayerFullscreen(false), [sendPlayerFullscreen]);

  // Native → page: the shell asks us to collapse (hardware back button).
  // The native shell sends this regardless of tier; the Worker tier owns
  // its own expand/collapse, the guard dedupes both paths.
  useEffect(() => {
    const off = bridgeOn("closeExpand", () => collapse());
    return () => off();
  }, [collapse]);

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
    if (native) {
      if (playerState === "expanded" || playerState === "expanding") collapse();
      else if (playerState === "inline") expand();
      return;
    }
    const el = boxRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen();
    } catch {
      /* ignore */
    }
  }, [native, playerState, expand, collapse]);

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

  // Wrap a non-shell branch so the debug strip survives it too. The strip must
  // never disappear on failure — that is exactly when it is needed.
  const withDebug = (node: React.ReactNode) =>
    debugOn ? (
      <div className="relative w-full">
        {node}
        {debugOverlay}
      </div>
    ) : (
      node
    );

  // Debug overlay (?pvpdebug=1, native only).
  const debugOverlay = debugOn ? (
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
        maxWidth: 420,
        whiteSpace: "pre",
      }}
    >
      {`tier: ${tierState.history.length === 0 ? "pending" : tierState.tier}`}
      {"\n"}{`tierHistory: ${tierState.history.map((h) => h.tier).join(" → ") || "-"}`}
      {"\n"}{`tierReason: ${tierState.reason ?? "-"}`}
      {"\n"}{`playCalls: ${playCallsRef.current}`}
      {"\n"}{`viewsLeft: ${grant?.viewsLeft ?? "-"}`}
      {"\n"}{Object.entries(debugRef.current).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")}
      {workerFailAgeMs(videoId) !== null && (
        <span style={{ pointerEvents: "auto" }}>
          {"\n"}workerFailMarker set {(workerFailAgeMs(videoId)! / 60000).toFixed(1)} min ago{" "}
          <button
            type="button"
            onClick={() => {
              clearWorkerFailMarker(videoId);
              dispatchTier({
                type: "RETRY",
                workerMode: grant?.mode === "worker",
                workerSrc: true,
                hasDriveFile: isDrive,
                youtubeAvailable: grant?.youtubeAvailable === true,
              });
            }}
            style={{ color: "#3BBCD9", background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            Clear
          </button>
        </span>
      )}
    </div>
  ) : null;

  if (over) return null;

  // Terminal: the machine ran out of tiers. This is the ONLY state where the
  // player is replaced by an error card (with Retry) — never a blank box.
  if (failed || isTerminal(tierState)) {
    return withDebug(
      <div
        className="relative grid aspect-video w-full place-items-center rounded-[20px] border p-8 text-center"
        style={{ borderColor: "var(--kt-line)", background: "#000" }}
        role="alert"
      >
        <div>
          <p className="font-bold text-white">{t.watch.playerFailT}</p>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
            {t.watch.playerFailD}
          </p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              dispatchTier({
                type: "RETRY",
                workerMode: grant?.mode === "worker",
                workerSrc: true,
                hasDriveFile: isDrive,
                youtubeAvailable: grant?.youtubeAvailable === true,
              });
            }}
            className="btn btn-primary mt-4"
          >
            {t.watch.retryBtn}
          </button>
        </div>
      </div>,
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
      className={`pvp relative aspect-video w-full overflow-hidden rounded-[20px] outline-none select-none${extraClass}`}
      style={{ background: "#000", userSelect: "none", WebkitUserSelect: "none" }}
      aria-label="Protected video player"
    >
      {cover}
      {debugOverlay}
      {body}
    </div>
  );

  // Opaque black cover over the player while expanding (above the video,
  // below watermark/controls). Never display:none and never remount.
  const cover = coverOn && (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-15 pointer-events-none"
      style={{
        background: "#000",
        opacity: coverFadeOut ? 0 : 1,
        transitionDuration: coverFadeOut ? "150ms" : "0ms",
      }}
    />
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

  /* Worker tier: a real <video> fed by the Worker (signed token in the URL,
     no Drive id). It is the first choice whenever the lesson has a Drive
     file; on failure the parent falls forward to Direct, then YouTube. */
  if (tier === "worker" && grant.src) {
    return withDebug(
      <WorkerVideoPlayer
        src={grant.src}
        expiresAt={grant.expiresAt}
        ttlSeconds={grant.ttlSeconds}
        videoId={videoId}
        native={native}
        watermark={watermark}
        playerState={playerState}
        onExpand={expand}
        onCollapse={collapse}
        safeInsets={safeInsets}
        debugOn={debugOn}
        onProgress={(s) => cbRef.current.onProgress(s)}
        onSeeked={(s) => cbRef.current.onSeeked(s)}
        onDuration={(s) => cbAllRef.current.onDuration(s)}
        onEnded={() => {
          if (!endedRef.current) {
            endedRef.current = true;
            cbRef.current.onEnded();
          }
        }}
        onWorkerHealthy={() => clearWorkerFailMarker(videoId)}
        onFatal={onWorkerFatal}
      />,
    );
  }

  /* Direct Drive tier: Plyr around a <video> whose src is the Drive API URL
     — no Worker, no token, no auth, no Supabase. Resolved by loadDirect
     from /api/play {fallback:"direct"}. */
  if (tier === "direct" && grant.directSrc) {
    return withDebug(
      <DirectDriveVideoPlayer
        src={grant.directSrc}
        onFatal={onDirectFatal}
        native={native}
        watermark={watermark}
        debugOn={debugOn}
        playerState={playerState}
        onExpand={expand}
        onCollapse={collapse}
        safeInsets={safeInsets}
      />,
    );
  }
  if (tier === "direct") {
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

  // YouTube tier: the chain ends here. A Drive lesson whose Direct tier died
  // shows the spinner ONLY until the YouTube embed arrives; once isYt the
  // render falls through to the YouTube player below. (Returning the spinner
  // while isYt — the previous `tier === "youtube" && isDrive` condition — made
  // the YouTube tier unreachable: the embed landed and the spinner stayed.)
  if (tier === "youtube" && isDrive && !isYt && !failed) {
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

  // Inside the native shell:
  //  - a source the native player understands (mp4 / HLS) is played by the
  //    native player — the page never sees a media URL;
  //  - YouTube keeps playing inside Google's own frame (the rules forbid
  //    touching it), and the native layer protects the window around it
  //    (FLAG_SECURE, watermark) instead of replacing the player.
  if (native && nativelyPlayable) {
    return (
      <div
        className="pvp relative aspect-video w-full overflow-hidden rounded-[20px]"
        style={{ background: "#000" }}
        aria-label={t.watch.nativePlay}
      >
        <button
          type="button"
          onClick={() => {
            // The native side owns the playback: hand it the session
            // credential (stored in the device keystore) and the lesson id.
            // The page never receives a media URL.
            void (async () => {
              try {
                const { supabase } = await import("../lib/db/client");
                const sb = supabase();
                const session = sb ? await sb.auth.getSession() : null;
                const token = session?.data?.session?.access_token ?? null;
                if (token) bridgeSend({ v: 1, type: "authCode", code: token });
              } catch {
                /* the native side will ask for a session if it has none */
              }
              bridgeSend({ v: 1, type: "playVideo", lessonId: videoId });
            })();
          }}
          className="absolute inset-0 z-20 grid place-items-center"
          style={{ background: "linear-gradient(135deg, #3A1E6B 0%, #6E4E9C 55%, #3D3250 100%)" }}
        >
          <span className="flex flex-col items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-20 w-20 place-items-center rounded-full"
              style={{ background: "#3BBCD9" }}
            >
              <svg viewBox="0 0 24 24" fill="#fff" className="h-9 w-9 translate-x-0.5" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{t.watch.nativePlay}</span>
            <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, maxWidth: 320, textAlign: "center" }}>
              {t.watch.nativePlayD}
            </span>
          </span>
        </button>
      </div>
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
