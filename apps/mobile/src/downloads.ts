/* Offline downloads — native only (2027-architecture.md §4, phase 4).
 *
 * Only R2 / HLS lessons can be stored locally. Drive files are viewer-only
 * and never leave Google's frame (PRODUCT-RULES rule 5), and YouTube embeds
 * have no offline path. The AES-128 segments stay encrypted on disk; their
 * key is stored beside them in the app sandbox, outside the WebView.
 *
 * No media URL, token or path is ever sent to the page or rendered to the
 * student. Only lesson ids and state cross the bridge.
 */

import { Directory, File, Paths } from "expo-file-system";
import { getDeviceId, getSessionToken } from "./session";
import { refreshPlayback, requestPlayback } from "./playback";
import { sendToWeb } from "./shellRef";

export type OfflineLesson = {
  lessonId: string;
  identity: string;
  downloadedAt: string;
};

const ROOT = new Directory(Paths.document, "downloads");
const MANIFEST = "lesson.json";
const PLAYLIST = "index.m3u8";

function safeName(lessonId: string): string {
  const safe = lessonId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe === "" ? "lesson" : safe;
}

function lessonDir(lessonId: string): Directory {
  return new Directory(ROOT, safeName(lessonId));
}

/** Reports state to the page over the bridge (ids only). */
function report(lessonId: string, state: "queued" | "done" | "failed"): void {
  try {
    sendToWeb({ v: 1, type: "downloadState", lessonId, state });
  } catch {
    /* bridge failures never break a download */
  }
}

/** True when a lesson has a complete offline copy. */
export function hasOfflineLesson(lessonId: string): boolean {
  try {
    const dir = lessonDir(lessonId);
    return new File(dir, PLAYLIST).exists && new File(dir, MANIFEST).exists;
  } catch {
    return false;
  }
}

/** The local playlist URI for offline playback, or null. */
export function offlinePlaylistUri(lessonId: string): string | null {
  try {
    const file = new File(lessonDir(lessonId), PLAYLIST);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Identity stored with the offline copy, for the watermark. */
export function offlineIdentity(lessonId: string): string {
  try {
    const file = new File(lessonDir(lessonId), MANIFEST);
    if (!file.exists) return "";
    const raw = JSON.parse(file.textSync()) as Partial<OfflineLesson>;
    return typeof raw.identity === "string" ? raw.identity : "";
  } catch {
    return "";
  }
}

/** All stored lessons, newest first. */
export function listOfflineLessons(): OfflineLesson[] {
  try {
    if (!ROOT.exists) return [];
    const rows: OfflineLesson[] = [];
    for (const entry of ROOT.list()) {
      if (!(entry instanceof Directory)) continue;
      const manifest = new File(entry, MANIFEST);
      if (!manifest.exists) continue;
      try {
        const raw = JSON.parse(manifest.textSync()) as Partial<OfflineLesson>;
        if (typeof raw.lessonId === "string" && raw.lessonId !== "") {
          rows.push({
            lessonId: raw.lessonId,
            identity: typeof raw.identity === "string" ? raw.identity : "",
            downloadedAt:
              typeof raw.downloadedAt === "string" ? raw.downloadedAt : "",
          });
        }
      } catch {
        /* a broken manifest is ignored, never shown to the student */
      }
    }
    return rows.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  } catch {
    return [];
  }
}

/** Delete one offline copy. */
export function removeOfflineLesson(lessonId: string): void {
  try {
    const dir = lessonDir(lessonId);
    if (dir.exists) dir.delete();
  } catch {
    /* best effort */
  }
}

/** Download one HLS lesson. Safe to call again: files are overwritten. */
export async function downloadLesson(lessonId: string): Promise<boolean> {
  report(lessonId, "queued");
  try {
    const token = await getSessionToken();
    const deviceId = await getDeviceId();
    if (!token || lessonId === "") {
      report(lessonId, "failed");
      return false;
    }

    // Prefer the view-free refresh: it only works when the student already
    // has a view row. Falling back to start burns one view (3 max).
    let grant = await refreshPlayback(lessonId, token, deviceId);
    if (!grant?.ok) grant = await requestPlayback(lessonId, token, deviceId);
    if (!grant?.ok) {
      report(lessonId, "failed");
      return false;
    }

    const playlistUrl = new URL(grant.grant.url);
    if (!playlistUrl.pathname.endsWith("/index.m3u8")) {
      // Drive / YouTube embeds are not downloadable (PRODUCT-RULES rule 5).
      report(lessonId, "failed");
      return false;
    }

    const response = await fetch(playlistUrl.toString());
    if (!response.ok) {
      report(lessonId, "failed");
      return false;
    }
    const playlist = await response.text();

    if (!ROOT.exists) Paths.document.createDirectory("downloads");
    if (!lessonDir(lessonId).exists) ROOT.createDirectory(safeName(lessonId));
    const dir = lessonDir(lessonId);
    const local: string[] = [];
    let segment = 0;

    for (const line of playlist.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "") {
        local.push(line);
        continue;
      }
      if (trimmed.startsWith("#")) {
        // EXT-X-KEY / EXT-X-MAP carry URI="...". The key stays encrypted;
        // only its file is stored locally, never printed or sent to the page.
        const attr = /URI="([^"]*)"/.exec(line);
        if (attr === null) {
          local.push(line);
          continue;
        }
        const name = trimmed.startsWith("#EXT-X-KEY") ? "key.bin" : "map.bin";
        if (!(await saveUri(attr[1], playlistUrl, dir, name))) {
          report(lessonId, "failed");
          return false;
        }
        local.push(line.replace(attr[0], `URI="${name}"`));
        continue;
      }
      const name = `seg${segment++}.ts`;
      if (!(await saveUri(trimmed, playlistUrl, dir, name))) {
        report(lessonId, "failed");
        return false;
      }
      local.push(name);
    }

    const identity =
      grant.grant.email +
      (grant.grant.phoneLast4 ? ` · ${grant.grant.phoneLast4}` : "");
    new File(dir, PLAYLIST).writeSync(local.join("\n"));
    new File(dir, MANIFEST).writeSync(
      JSON.stringify({
        lessonId,
        identity,
        downloadedAt: new Date().toISOString(),
      } satisfies OfflineLesson),
    );
    report(lessonId, "done");
    return true;
  } catch {
    report(lessonId, "failed");
    return false;
  }
}

async function saveUri(
  uri: string,
  base: URL,
  dir: Directory,
  name: string,
): Promise<boolean> {
  try {
    const absolute = new URL(uri, base);
    await File.downloadFileAsync(absolute.toString(), new File(dir, name), {
      idempotent: true,
    });
    return true;
  } catch {
    return false;
  }
}
