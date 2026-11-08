/* Google Drive share-link -> direct image URL.
   Accepts:  https://drive.google.com/file/d/FILE_ID/view?usp=sharing
             https://drive.google.com/open?id=FILE_ID
             https://drive.google.com/uc?id=FILE_ID[&export=download]
             https://lh3.googleusercontent.com/d/FILE_ID (already direct)
             plain https URLs and bundled relative paths (assets/...)
   Rejects:  data: URIs (quota killers, never persisted), empty/blank. */

const DRIVE_FILE = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_ID_PARAM = /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/;

export function extractDriveId(input: string): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  return v.match(DRIVE_FILE)?.[1] ?? v.match(DRIVE_ID_PARAM)?.[1] ?? null;
}

export function toDirectImageUrl(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  // Never persist embedded payloads — they blow the 5MB localStorage quota.
  if (/^data:/i.test(v)) return "";
  const id = extractDriveId(v);
  if (id) return `https://lh3.googleusercontent.com/d/${id}`;
  return v;
}

/* Drive share-link -> embeddable video preview URL (player use only — the
   DB keeps the raw admin-pasted link; conversion happens at render time).
   https://drive.google.com/file/d/FILE_ID/preview */
export function toDrivePreviewUrl(input: string): string | null {
  const id = extractDriveId((input ?? "").trim());
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/* Drive share-link -> direct media URL for duration probing only (a hidden
   <video preload="metadata"> reads headers without CORS). Never rendered,
   never persisted — the preview embed stays the playback path. Best-effort:
   huge files may hit Drive's virus-scan interstitial and fail the probe. */
export function toDriveMediaUrl(input: string): string | null {
  return driveMediaCandidates(input)[0] ?? null;
}

/* Ordered playback candidates: the classic uc host first, then the newer
   usercontent host with confirm=t (often skips the virus-scan interstitial
   that breaks direct streaming of big files). The player tries each in turn
   and only then falls back to the sandboxed preview embed. */
export function driveMediaCandidates(input: string): string[] {
  const id = extractDriveId((input ?? "").trim());
  if (!id) return [];
  return [
    `https://drive.google.com/uc?export=download&id=${id}`,
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
  ];
}

/** Non-empty and (absolute https, already-direct, or bundled relative path). */
export function isUsableImageUrl(input: string): boolean {
  const v = (input ?? "").trim();
  if (!v || /^data:/i.test(v)) return false;
  if (/^https:\/\//i.test(v)) return true;
  // Bundled assets served from our own domain.
  if (/^(assets\/|\/assets\/)/.test(v)) return true;
  return false;
}
