/* Google Drive upstream: metadata (cached once per file) and exact byte
 * ranges. No URL, key or token is ever logged.
 */

import type { DriveAuth } from "./credentials";

export type DriveMeta = { size: number; mimeType: string };

export type DriveRangeResult =
  | { kind: "ok"; body: ArrayBuffer; status: number }
  | { kind: "quota"; status: number; reason: string }
  | { kind: "auth"; status: number }
  | { kind: "error"; status: number; reason: string };

export type DriveMetaResult =
  | { kind: "ok"; meta: DriveMeta }
  | { kind: "quota"; status: number; reason: string }
  | { kind: "auth"; status: number }
  | { kind: "error"; status: number; reason: string };

const API = "https://www.googleapis.com/drive/v3/files";
const META_TTL_SECONDS = 60 * 60;
const metaCache = new Map<string, { meta: DriveMeta; at: number }>();

function withAuth(url: string, auth: DriveAuth): { url: string; headers: Record<string, string> } {
  if (auth.kind === "key") {
    return { url: `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(auth.key)}`, headers: {} };
  }
  return { url, headers: { authorization: `Bearer ${auth.token}` } };
}

function quotaReason(text: string): string {
  try {
    const json = JSON.parse(text) as {
      error?: { errors?: Array<{ reason?: string }>; status?: string };
    };
    return json.error?.errors?.[0]?.reason ?? json.error?.status ?? "quota";
  } catch {
    return "quota";
  }
}

async function classifyFailure(res: Response): Promise<DriveRangeResult> {
  const status = res.status;
  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  if (status === 401) return { kind: "auth", status };
  if (status === 403 || status === 429) {
    return { kind: "quota", status, reason: quotaReason(text).slice(0, 80) };
  }
  return { kind: "error", status, reason: `drive-${status}` };
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
      const failure = await classifyFailure(res);
      return failure.kind === "ok" ? { kind: "error", status: res.status, reason: "meta" } : failure;
    }
    const json = (await res.json()) as { mimeType?: string; size?: string };
    const size = Number(json.size ?? NaN);
    if (!Number.isFinite(size) || size <= 0) {
      return { kind: "error", status: 502, reason: "no-size" };
    }
    const meta: DriveMeta = {
      size,
      mimeType: typeof json.mimeType === "string" && json.mimeType !== "" ? json.mimeType : "video/mp4",
    };
    metaCache.set(fileId, { meta, at: now });
    return { kind: "ok", meta };
  } catch {
    return { kind: "error", status: 502, reason: "meta-fetch" };
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
        return { kind: "error", status: 200, reason: "range-ignored" };
      }
    }
    const body = await res.arrayBuffer();
    return { kind: "ok", body, status: res.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "error", status: 499, reason: "aborted" };
    }
    return { kind: "error", status: 502, reason: "range-fetch" };
  }
}

/** Test hook: clears the metadata cache. */
export function clearMetaCache(): void {
  metaCache.clear();
}
