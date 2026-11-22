/** Direct Drive playback helpers (test page + direct tier).
 *
 * The browser API key is a public-by-design static key: it is restricted by
 * HTTP referrer and is NOT a secret. Still, it is kept out of logs and
 * debug output — no URL with the key is ever displayed (see redactDirectUrl
 * and the PlayerTest debug strip).
 */

export function directDriveUrl(fileId: string, key: string): string | null {
  const fid = (fileId ?? "").trim();
  const k = (key ?? "").trim();
  if (fid === "" || k === "") return null;
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?alt=media&key=${encodeURIComponent(k)}&supportsAllDrives=true`;
}

/** Redact the key value — debug output only, never logs. */
export function redactDirectUrl(src: string): string {
  return src.replace(/([?&])key=[^&]*/, "$1key=<redacted>");
}

/** Origin only — never includes the key. Used by debug strips. */
export function directSrcHost(src: string | null): string {
  if (!src) return "";
  try {
    return new URL(src).origin;
  } catch {
    return "";
  }
}
