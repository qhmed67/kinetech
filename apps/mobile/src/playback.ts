/* Native playback request (2027-architecture.md §2.4).
 *
 * The native side asks the server for a playback grant. The grant carries a
 * short-lived media URL and the watermark identity — it stays inside the
 * native process: it is never sent to the WebView, never logged and never
 * rendered to the student.
 */

import { parsePlaybackResult, type PlaybackResult } from "@kinetech/bridge";
import { ENV } from "./env";

export type { PlaybackResult };

async function post(
  path: string,
  videoId: string,
  token: string,
  deviceId: string,
): Promise<PlaybackResult | null> {
  try {
    const response = await fetch(`${ENV.API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-kt-device-id": deviceId,
      },
      body: JSON.stringify({ video_id: videoId }),
    });
    const raw = await response.json().catch(() => null);
    return parsePlaybackResult(raw);
  } catch {
    return null;
  }
}

/**
 * Ask the server for a playback grant for one lesson.
 * This is the path that COUNTS a view (the server runs its normal gate).
 */
export function requestPlayback(
  videoId: string,
  token: string,
  deviceId: string,
): Promise<PlaybackResult | null> {
  return post("/api/playback/start", videoId, token, deviceId);
}

/**
 * Renew an expiring token. The server re-checks the entitlement but does NOT
 * burn another view — the student must not pay for a technical detail.
 */
export function refreshPlayback(
  videoId: string,
  token: string,
  deviceId: string,
): Promise<PlaybackResult | null> {
  return post("/api/playback/refresh", videoId, token, deviceId);
}
