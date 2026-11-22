/* Google Drive upstream: metadata (cached once per file) and exact byte
 * ranges. No URL, key or token is ever logged.
 *
 * Failure taxonomy (non-secret): every result carries `reason` (+ `status`,
 * `drive_reason` = Google's error.errors[0].reason when present):
 *   drive_403  Drive returned 403        (quota class)
 *   drive_429  Drive returned 429        (quota class)
 *   drive_404  Drive returned 404
 *   drive_5xx  Drive returned 5xx
 *   drive_<n>  any other non-auth/non-quota status
 *   meta_failed  meta call failed without a status (fetch throw, invalid JSON,
 *                no size)
 *   range_ignored  Drive returned 200 where a 206 was required
 *   content_range_mismatch  206 Content-Range/body length ≠ requested range
 *   empty_body  zero-byte body where a non-empty one was required
 *   network     fetch threw / aborted (status 499 = aborted)
 */

import type { DriveAuth } from "./credentials";

export type DriveMeta = { size: number; mimeType: string };

export type DriveQuota = { kind: "quota"; status: number; reason: string; drive_reason: string | null };
export type DriveAuthFailure = { kind: "auth"; status: number };
export type DriveError = { kind: "error"; status: number; reason: string; drive_reason: string | null };

type DriveFailure = DriveQuota | DriveAuthFailure | DriveError;

export type DriveRangeResult = { kind: "ok"; body: ArrayBuffer; status: number } | DriveFailure;

export type DriveMetaResult = { kind: "ok"; meta: DriveMeta } | DriveFailure;

const API = "https://www.googleapis.com/drive/v3/files";
const META_TTL_SECONDS = 60 * 60;
const metaCache = new Map<string, { meta: DriveMeta; at: number }>();

function withAuth(url: string, auth: DriveAuth): { url: string; headers: Record<string, string> } {
  if (auth.kind === "key") {
    return { url: `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(auth.key)}`, headers: {} };
  }
  return { url, headers: { authorization: `Bearer ${auth.token}` } };
}

function googleReason(text: string): string | null {
  try {
    const json = JSON.parse(text) as {
      error?: { errors?: Array<{ reason?: string }>; status?: string };
    };
    return json.error?.errors?.[0]?.reason ?? null;
  } catch {
    return null;
  }
}

async function classifyFailure(res: Response): Promise<DriveFailure> {
  const status = res.status;
  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  const driveReason = googleReason(text);
  if (status === 401) return { kind: "auth", status };
  if (status === 403 || status === 429) {
    return { kind: "quota", status, reason: status === 403 ? "drive_403" : "drive_429", drive_reason: driveReason };
  }
  if (status >= 500 && status < 600) {
    return { kind: "error", status, reason: "drive_5xx", drive_reason: driveReason };
  }
  return { kind: "error", status, reason: `drive_${status}`, drive_reason: driveReason };
}

/** File size + mime type, cached per file for an hour. */
export async function fetchDriveMeta(
  fileId: string,
  auth: DriveAuth,
  fetchImpl: typeof fetch = fetch,
  now: number = Math.floor(Date.now() / 1000),
): Promise<DriveMetaResult> {
  const cached = metaCache.get(fileId);
  if (cached && now - cached.at < META_TTL_SECONDS) {
    return { kind: "ok", meta: cached.meta };
  }
  const { url, headers } = withAuth(
    `${API}/${encodeURIComponent(fileId)}?fields=id,mimeType,size&supportsAllDrives=true`,
    auth,
  );
  try {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      return classifyFailure(res);
    }
    const json = (await res.json()) as { mimeType?: string; size?: string };
    const size = Number(json.size ?? NaN);
    if (!Number.isFinite(size) || size <= 0) {
      return { kind: "error", status: 502, reason: "meta_failed", drive_reason: null };
    }
    const meta: DriveMeta = {
      size,
      mimeType: typeof json.mimeType === "string" && json.mimeType !== "" ? json.mimeType : "video/mp4",
    };
    metaCache.set(fileId, { meta, at: now });
    return { kind: "ok", meta };
  } catch {
    return { kind: "error", status: 502, reason: "meta_failed", drive_reason: null };
  }
}

/** Exact inclusive byte range. Refuses a 200 full-body answer so a Drive
 *  server that ignored Range can never make us buffer a whole lesson. */
export async function fetchDriveRange(
  fileId: string,
  start: number,
  end: number,
  auth: DriveAuth,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DriveRangeResult> {
  const { url, headers } = withAuth(
    `${API}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    auth,
  );
  const expected = end - start + 1;
  try {
    const res = await fetchImpl(url, {
      headers: { ...headers, range: `bytes=${start}-${end}` },
      signal,
    });
    if (!res.ok && res.status !== 206) {
      return classifyFailure(res);
    }
    if (res.status === 200) {
      const length = Number(res.headers.get("content-length") ?? NaN);
      if (!Number.isFinite(length) || length > expected) {
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        return { kind: "error", status: 200, reason: "range_ignored", drive_reason: null };
      }
    }
    if (res.status === 206) {
      const cr = res.headers.get("content-range");
      if (cr !== null) {
        const m = /^bytes (\d+)-(\d+)\/\d+$/.exec(cr.trim());
        if (!m || Number(m[2]) - Number(m[1]) + 1 !== expected) {
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          return { kind: "error", status: 206, reason: "content_range_mismatch", drive_reason: null };
        }
      }
    }
    const body = await res.arrayBuffer();
    if (body.byteLength !== expected) {
      return { kind: "error", status: res.status, reason: "content_range_mismatch", drive_reason: null };
    }
    return { kind: "ok", body, status: res.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "error", status: 499, reason: "network", drive_reason: null };
    }
    return { kind: "error", status: 502, reason: "network", drive_reason: null };
  }
}

/** Test hook: clears the metadata cache. */
export function clearMetaCache(): void {
  metaCache.clear();
}
