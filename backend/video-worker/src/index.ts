/* Cloudflare Worker — the only door to the private R2 lesson bucket.
 *
 * Routes (all of them need a valid playback token):
 *   GET /v/:lessonId/index.m3u8?t=TOKEN   the playlist (rewritten)
 *   GET /v/:lessonId/seg/:file?t=TOKEN    one encrypted segment
 *   GET /v/:lessonId/key?t=TOKEN          the AES-128 key for that lesson
 *
 * The token is short-lived, HMAC-signed and bound to ONE lesson, ONE user
 * and ONE device. The bucket is private; the public r2.dev URL stays OFF.
 *
 * Honest scope: AES-128 HLS + a signed URL + a device-bound token raise the
 * cost of copying and make a leak traceable. They are NOT DRM and they do
 * NOT make the video impossible to capture. Never claim otherwise.
 */

import { verifyPlaybackToken } from "@kinetech/playback-token";
import {
  parseRangeHeader,
  TokenRateLimiter,
  type Env,
  type R2BucketLike,
} from "./helpers";
import { rewritePlaylist } from "./playlist";

const PLAYLIST_TYPE = "application/vnd.apple.mpegurl";
const SEGMENT_TYPE = "video/mp2t";
const KEY_TYPE = "application/octet-stream";
/** Playlists and keys are never cached by anything in between. */
const PRIVATE = "private, no-store";

const limiter = new TokenRateLimiter();

/** Generic errors — a caller learns nothing about the bucket. */
function denied(): Response {
  return new Response("Not authorized", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PRIVATE },
  });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PRIVATE },
  });
}

function badRequest(): Response {
  return new Response("Bad request", {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": PRIVATE },
  });
}

/** Verify the token against the current secret (and the previous one while a
 *  rotation is in flight). */
async function authorize(
  token: string,
  lessonId: string,
  env: Env,
): Promise<boolean> {
  const secrets = [env.GRANT_SECRET, env.GRANT_SECRET_PREV].filter(
    (value): value is string => typeof value === "string" && value !== "",
  );
  for (const secret of secrets) {
    const payload = await verifyPlaybackToken(token, secret, { lessonId });
    if (payload) return true;
  }
  return false;
}

type Route =
  | { kind: "playlist" }
  | { kind: "segment"; file: string }
  | { kind: "key" };

function parseRoute(pathname: string): { lessonId: string; route: Route } | null {
  const match = /^\/v\/([^/]+)\/(index\.m3u8|seg\/([^/]+)|key)$/.exec(pathname);
  if (!match) return null;
  const lessonId = decodeURIComponent(match[1]);
  if (lessonId === "") return null;
  if (match[2] === "index.m3u8") return { lessonId, route: { kind: "playlist" } };
  if (match[2] === "key") return { lessonId, route: { kind: "key" } };
  const file = decodeURIComponent(match[3] ?? "");
  // The file name must stay a plain name inside the segment folder.
  if (file === "" || file.includes("/") || file.includes("..")) return null;
  return { lessonId, route: { kind: "segment", file } };
}

/** R2 keys — the lesson folder and the private key folder. */
export function r2Keys(lessonId: string, route: Route): { objectKey: string } {
  if (route.kind === "playlist") {
    return { objectKey: `lessons/${lessonId}/index.m3u8` };
  }
  if (route.kind === "key") {
    return { objectKey: `keys/${lessonId}.key` };
  }
  return { objectKey: `lessons/${lessonId}/seg/${route.file}` };
}

async function servePlaylist(
  bucket: R2BucketLike,
  lessonId: string,
  token: string,
): Promise<Response> {
  const object = await bucket.get(r2Keys(lessonId, { kind: "playlist" }).objectKey);
  if (!object) return notFound();
  const text = await new Response(object.body).text();
  const rewritten = rewritePlaylist(text, lessonId, token);
  return new Response(rewritten, {
    status: 200,
    headers: {
      "content-type": PLAYLIST_TYPE,
      "cache-control": PRIVATE,
      "x-content-type-options": "nosniff",
    },
  });
}

async function serveSegment(
  bucket: R2BucketLike,
  lessonId: string,
  file: string,
  request: Request,
): Promise<Response> {
  const objectKey = r2Keys(lessonId, { kind: "segment", file }).objectKey;
  // Range first: the object size is needed to answer a suffix range.
  const head = await bucket.get(objectKey);
  if (!head) return notFound();
  const size = head.size;

  const range = parseRangeHeader(request.headers.get("range"), size);
  if (range) {
    const partial = await bucket.get(objectKey, { range });
    if (!partial) return notFound();
    const length = partial.range?.length ?? range.length;
    const offset = partial.range?.offset ?? range.offset;
    return new Response(partial.body, {
      status: 206,
      headers: {
        "content-type": SEGMENT_TYPE,
        "content-length": String(length),
        "content-range": `bytes ${offset}-${offset + length - 1}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": PRIVATE,
        "x-content-type-options": "nosniff",
      },
    });
  }

  return new Response(head.body, {
    status: 200,
    headers: {
      "content-type": SEGMENT_TYPE,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": PRIVATE,
      "x-content-type-options": "nosniff",
    },
  });
}

async function serveKey(
  bucket: R2BucketLike,
  lessonId: string,
): Promise<Response> {
  // The key file lives under the private `keys/` prefix and is only ever
  // served by this route — no other path exposes it.
  const object = await bucket.get(r2Keys(lessonId, { kind: "key" }).objectKey);
  if (!object) return notFound();
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": KEY_TYPE,
      "content-length": String(object.size),
      "cache-control": PRIVATE,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "allow": "GET, HEAD", "cache-control": PRIVATE },
    });
  }

  const url = new URL(request.url);
  const parsed = parseRoute(url.pathname);
  if (!parsed) return badRequest();

  const token = url.searchParams.get("t") ?? "";
  if (token === "") return denied();

  const allowed = await authorize(token, parsed.lessonId, env);
  if (!allowed) return denied();

  const limit = limiter.check(token);
  if (!limit.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": String(limit.retryAfterSeconds), "cache-control": PRIVATE },
    });
  }

  const { lessonId, route } = parsed;
  if (route.kind === "playlist") return servePlaylist(env.VIDEOS, lessonId, token);
  if (route.kind === "key") return serveKey(env.VIDEOS, lessonId);
  return serveSegment(env.VIDEOS, lessonId, route.file, request);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
