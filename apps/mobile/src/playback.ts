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

/**
 * Ask the server for a playback grant for one lesson.
 * Returns the parsed result, or null when the server answered something
 * unexpected (the caller then shows an honest "try again" message).
 */
export async function requestPlayback(
  videoId: string,
  token: string,
  deviceId: string,
): Promise<PlaybackResult | null> {
  try {
    const response = await fetch(`${ENV.API_BASE_URL}/api/playback/start`, {
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
