/* Google Drive / YouTube link extraction for the admin editor and the
 * Worker-streamed player.
 *
 * Accepted Drive forms (all resolve to the same file id):
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?id=<ID>&export=download
 *   https://drive.google.com/uc?export=download&id=<ID>
 *   https://drive.google.com/file/d/<ID>/preview
 * A bare id is also accepted by isValidDriveFileId (used by the Worker token
 * path, where the id never appears in a URL).
 */

const DRIVE_FILE = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/;
const DRIVE_ID_PARAM = /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/;

export function extractDriveFileId(input: string): string | null {
  const v = (input ?? "").trim();
  if (v === "") return null;
  return v.match(DRIVE_FILE)?.[1] ?? v.match(DRIVE_ID_PARAM)?.[1] ?? null;
}

export function isValidDriveFileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,}$/.test((id ?? "").trim());
}

export function drivePreviewUrl(idOrLink: string): string | null {
  const id = isValidDriveFileId(idOrLink)
    ? idOrLink.trim()
    : extractDriveFileId(idOrLink);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/** Extract a YouTube video id from watch / youtu.be / embed / shorts / live
 *  links, or a bare 11-character id. Only YouTube hosts are accepted, so a
 *  `?v=` on some other site never becomes a fallback. */
export function extractYoutubeVideoId(input: string): string | null {
  const v = (input ?? "").trim();
  if (v === "") return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  const isYoutube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube.com");
  if (!isYoutube) return null;

  const param = url.searchParams.get("v");
  if (param && /^[A-Za-z0-9_-]{11}$/.test(param)) return param;
  const m = url.pathname.match(/\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

export function isValidYoutubeVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test((id ?? "").trim());
}
