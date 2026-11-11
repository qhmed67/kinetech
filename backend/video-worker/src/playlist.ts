/* Playlist rewriting.
 *
 * The uploaded playlist references its segments and its AES-128 key with
 * plain paths. Every one of those requests has to carry the playback token,
 * otherwise the Worker would refuse them. So the Worker rewrites the
 * playlist on the way out:
 *
 *   seg/seg000.ts   ->  /v/<lessonId>/seg/seg000.ts?t=TOKEN
 *   keys/<id>.key   ->  /v/<lessonId>/key?t=TOKEN
 *
 * The key URI is ALWAYS rewritten to the key route — the key file lives in a
 * private R2 prefix and is never served by any other path.
 */

export type UriKind = "segment" | "key";

/** Map one playlist URI onto the Worker route that serves it. */
export function mapUri(uri: string, lessonId: string, token: string): string {
  const trimmed = uri.trim();
  const path = trimmed.includes("://")
    ? safePathname(trimmed)
    : trimmed.replace(/^\.\//, "");

  const isKey = path.endsWith(".key") || path.includes("/keys/");
  const kind: UriKind = isKey ? "key" : "segment";

  if (kind === "key") {
    return `/v/${encodeURIComponent(lessonId)}/key?t=${encodeURIComponent(token)}`;
  }

  const file = path.split("/").filter(Boolean).pop() ?? "";
  return `/v/${encodeURIComponent(lessonId)}/seg/${encodeURIComponent(file)}?t=${encodeURIComponent(token)}`;
}

function safePathname(uri: string): string {
  try {
    return new URL(uri).pathname;
  } catch {
    return uri;
  }
}

/** Rewrite every URI in a playlist so it carries the token. */
export function rewritePlaylist(
  playlist: string,
  lessonId: string,
  token: string,
): string {
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;
      if (trimmed.startsWith("#")) {
        // EXT-X-KEY / EXT-X-MAP carry a URI="..." attribute.
        return line.replace(
          /URI="([^"]*)"/g,
          (_match, uri: string) => `URI="${mapUri(uri, lessonId, token)}"`,
        );
      }
      return mapUri(trimmed, lessonId, token);
    })
    .join("\n");
}
