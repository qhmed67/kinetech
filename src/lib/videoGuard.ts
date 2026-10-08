import { useEffect, useRef, useState } from "react";

/* Obfuscation helpers: the raw YouTube ID never sits in props, state, or the
   DOM in plain text. XOR + base64 is deterrence, not encryption — a determined
   attacker with DevTools can always recover it. Real protection stays
   server-side (signed-in RPCs, 3-view cap, watermarked identity). */

const XOR_KEY = 0x5a;

export function obfuscateId(id: string): string {
  const bytes = new TextEncoder().encode(id);
  const xored = bytes.map((b) => b ^ XOR_KEY);
  let bin = "";
  xored.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

export function deobfuscateId(payload: string): string {
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ XOR_KEY;
  return new TextDecoder().decode(bytes);
}

/** Extract a YouTube video ID from watch / youtu.be / embed / shorts URLs. */
export function extractYoutubeId(input: string): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const m =
    v.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ??
    v.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ??
    v.match(/\/embed\/([a-zA-Z0-9_-]{11})/) ??
    v.match(/\/shorts\/([a-zA-Z0-9_-]{11})/) ??
    v.match(/\/live\/([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

export function isYoutubeSource(src: string): boolean {
  return extractYoutubeId(src) !== null;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/* ---------- minimal YouTube IFrame API types (no extra dep) ---------- */

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setPlaybackQuality: (quality: string) => void;
  getPlaybackQuality: () => string;
  getAvailableQualityLevels: () => string[];
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVideoUrl: () => string;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
};

type YtApi = {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { data: number; target: YtPlayer }) => void;
        onError?: () => void;
      };
    },
  ) => YtPlayer;
};

declare global {
  interface Window {
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtApi> | null = null;

/** Singleton loader for the YouTube IFrame API. */
export function loadYoutubeApi(): Promise<YtApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YtApi>((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try {
          prev?.();
        } catch {
          /* ignore */
        }
        if (window.YT?.Player) resolve(window.YT);
        else {
          apiPromise = null;
          reject(new Error("youtube api failed"));
        }
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => {
        apiPromise = null;
        reject(new Error("youtube api failed"));
      };
      document.head.appendChild(tag);
      window.setTimeout(() => {
        if (!window.YT?.Player) {
          apiPromise = null;
          reject(new Error("youtube api timeout"));
        }
      }, 15000);
    });
  }
  return apiPromise;
}

/* ---------- rotating internal session ---------- */

/**
 * Rotates an opaque internal session token on an interval and re-asserts
 * iframe isolation (pointer-events off, overlay intact) without touching
 * playback — no re-buffer, no seek reset. Static scrapers binding onto one
 * observed state go stale; the token also stamps our play-count RPCs so
 * replayed calls from another context can be told apart server-side later.
 */
export function useRotatingSession(intervalMs = 5 * 60 * 1000): React.MutableRefObject<string> {
  const token = useRef(`s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`);
  const [, bump] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      token.current = `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      bump((n) => n + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return token;
}
