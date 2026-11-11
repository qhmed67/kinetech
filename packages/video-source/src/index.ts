/* Video sources — one interface, several providers.
 *
 * A lesson says WHERE its media lives; the provider turns that into
 * something the native player can actually fetch. Adding a provider later
 * (a CDN, another bucket, a DRM provider) means adding one implementation
 * here — the app and the server route stay untouched.
 *
 * Honest scope: the R2 provider hands out a short-lived signed HLS playlist
 * behind an HMAC token. That raises the cost of copying and makes a leak
 * traceable. It is NOT DRM and the video is NOT 'fully protected'.
 */

import { signPlaybackToken, TOKEN_VERSION } from "@kinetech/playback-token";

export type LessonSourceKind = "r2" | "drive";

export type LessonRecord = {
  /** the video row id (the lesson id) */
  videoId: string;
  /** where the media lives */
  source: LessonSourceKind;
  /** the stored location (r2 marker or drive link) — never sent to a student */
  srcUrl?: string;
};

export type PlaybackTarget =
  /** the native player can fetch this */
  | { kind: "url"; url: string; expiresAt: string; headers?: Record<string, string> }
  /** the native player cannot play this source */
  | { kind: "unsupported"; code: "NATIVE_UNSUPPORTED_SOURCE" };

export type ResolveContext = {
  /** shared HMAC secret (Vercel env PLAYBACK_GRANT_SECRET) */
  secret: string;
  /** base URL of the Cloudflare Worker (Vercel env VIDEO_WORKER_URL) */
  workerUrl: string;
  /** the signed-in user id */
  userId: string;
  /** the device the grant is bound to */
  deviceId: string;
  /** seconds a playback token stays valid */
  ttlSeconds?: number;
  /** clock (tests) */
  now?: number;
};

export interface VideoSource {
  readonly kind: LessonSourceKind;
  resolve(lesson: LessonRecord, context: ResolveContext): Promise<PlaybackTarget>;
}

export const DEFAULT_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours

/** The Worker playlist URL for a lesson, with the token attached.
 *  Mirrored (self-contained) in apps/web/api/playback/{start,refresh}.ts
 *  because Vercel's function bundler cannot load workspace packages — the
 *  drift guard in apps/web/src/native/__tests__/api-grant.test.ts compares
 *  this helper with both api copies. */
export function r2PlaylistUrl(workerUrl: string, lessonId: string, token: string): string {
  const base = workerUrl.replace(/\/+$/, "");
  return `${base}/v/${encodeURIComponent(lessonId)}/index.m3u8?t=${encodeURIComponent(token)}`;
}

/** R2 lessons: the Worker serves the (encrypted) HLS playlist behind a
 *  short-lived, device-bound token. */
export class R2Source implements VideoSource {
  readonly kind = "r2" as const;

  async resolve(lesson: LessonRecord, context: ResolveContext): Promise<PlaybackTarget> {
    if (context.secret === "" || context.workerUrl === "") {
      // Misconfigured server — fail closed instead of handing out a raw link.
      return { kind: "unsupported", code: "NATIVE_UNSUPPORTED_SOURCE" };
    }
    const ttl = context.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
    const now = context.now ?? Math.floor(Date.now() / 1000);
    const token = await signPlaybackToken(
      {
        v: TOKEN_VERSION,
        lid: lesson.videoId,
        uid: context.userId,
        did: context.deviceId,
        exp: now + ttl,
      },
      context.secret,
    );
    return {
      kind: "url",
      url: r2PlaylistUrl(context.workerUrl, lesson.videoId, token),
      expiresAt: new Date((now + ttl) * 1000).toISOString(),
    };
  }
}

/** Drive lessons: the file is viewer-only and plays inside Google's own
 *  frame (the rules forbid fetching or re-serving it), so there is nothing
 *  a native player may be handed. */
export class DriveSource implements VideoSource {
  readonly kind = "drive" as const;

  async resolve(_lesson: LessonRecord, _context: ResolveContext): Promise<PlaybackTarget> {
    return { kind: "unsupported", code: "NATIVE_UNSUPPORTED_SOURCE" };
  }
}

const providers: Record<LessonSourceKind, VideoSource> = {
  r2: new R2Source(),
  drive: new DriveSource(),
};

/** The provider for a lesson. A new provider only has to be registered
 *  here — no app change, no server change. */
export function sourceFor(kind: LessonSourceKind | string | null | undefined): VideoSource {
  if (kind === "r2") return providers.r2;
  return providers.drive;
}

/** Read the provider kind out of a lesson record.
 *
 *  - the `source` column wins when it exists (migration applied),
 *  - otherwise the stored marker decides: "r2:" means R2, anything else is
 *    a Drive link (the current behaviour).
 */
export function kindOf(record: { source?: string | null; srcUrl?: string | null }): LessonSourceKind {
  if (typeof record.source === "string" && record.source !== "") {
    return record.source === "r2" ? "r2" : "drive";
  }
  const marker = (record.srcUrl ?? "").trim().toLowerCase();
  if (marker.startsWith("r2:")) return "r2";
  return "drive";
}
