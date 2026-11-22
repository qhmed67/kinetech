/* Range parsing + chunk math — pure functions, unit-tested.
 *
 * The Worker only ever serves a bounded slice of a file. Open-ended requests
 * are capped so a 2 GB lesson is never buffered; the browser continues with
 * the next Range. `bytes=-N` keeps its "last N bytes" meaning.
 */

export type ParsedRange =
  | { kind: "none" }
  | { kind: "ok"; start: number; end: number; suffix: boolean }
  | { kind: "multi" }
  | { kind: "unsatisfiable" };

/** Parse a single-range `Range` header. Multi-range is reported separately so
 *  the caller can reject it with 416 (never silently serve the wrong bytes). */
export function parseRangeHeader(header: string | null, size: number): ParsedRange {
  if (size <= 0) return { kind: "unsatisfiable" };
  if (header === null || header.trim() === "") return { kind: "none" };
  const value = header.trim();
  const match = /^bytes=(.+)$/i.exec(value);
  if (!match) return { kind: "none" };
  const specs = match[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (specs.length === 0) return { kind: "none" };
  if (specs.length > 1) return { kind: "multi" };

  const spec = specs[0];
  if (spec.startsWith("-")) {
    const suffixLength = Number(spec.slice(1));
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return { kind: "unsatisfiable" };
    const start = Math.max(0, size - suffixLength);
    return { kind: "ok", start, end: size - 1, suffix: true };
  }

  const dash = spec.indexOf("-");
  if (dash <= 0) return { kind: "unsatisfiable" };
  const start = Number(spec.slice(0, dash));
  const endRaw = spec.slice(dash + 1);
  if (!Number.isInteger(start) || start < 0) return { kind: "unsatisfiable" };
  if (start >= size) return { kind: "unsatisfiable" };
  if (endRaw === "") {
    return { kind: "ok", start, end: size - 1, suffix: false };
  }
  const end = Number(endRaw);
  if (!Number.isInteger(end) || end < start) return { kind: "unsatisfiable" };
  return { kind: "ok", start, end: Math.min(end, size - 1), suffix: false };
}

export type Chunk = { index: number; start: number; end: number };

/** The aligned chunk containing a byte. */
export function chunkFor(byte: number, size: number, chunkSize: number): Chunk {
  const index = Math.floor(byte / chunkSize);
  const start = index * chunkSize;
  return { index, start, end: Math.min(size - 1, start + chunkSize - 1) };
}

/** Every aligned chunk touched by [start, end]. */
export function chunksForRange(start: number, end: number, size: number, chunkSize: number): Chunk[] {
  if (size <= 0 || end < start) return [];
  const first = Math.floor(start / chunkSize);
  const last = Math.floor(Math.min(end, size - 1) / chunkSize);
  const out: Chunk[] = [];
  for (let index = first; index <= last; index += 1) {
    const chunkStart = index * chunkSize;
    out.push({ index, start: chunkStart, end: Math.min(size - 1, chunkStart + chunkSize - 1) });
  }
  return out;
}

/** Resolve the served window for a request, capping unbounded/oversized
 *  requests to `maxServe` bytes so nothing buffers a whole file. */
export function servedWindow(
  parsed: ParsedRange,
  size: number,
  maxServe: number,
): { start: number; end: number } | null {
  if (size <= 0) return null;
  if (parsed.kind === "none") {
    return { start: 0, end: Math.min(size - 1, maxServe - 1) };
  }
  if (parsed.kind !== "ok") return null;
  if (parsed.suffix) {
    // Keep the suffix semantics: serve the actual LAST bytes (capped).
    const length = Math.min(parsed.end - parsed.start + 1, maxServe);
    return { start: size - length, end: size - 1 };
  }
  const end = Math.min(parsed.end, parsed.start + maxServe - 1, size - 1);
  return { start: parsed.start, end };
}
