import { describe, expect, it } from "vitest";
import {
  chunkFor,
  chunksForRange,
  parseRangeHeader,
  servedWindow,
} from "../src/range";

const SIZE = 10_000;

describe("parseRangeHeader", () => {
  it("treats a missing or empty header as no range", () => {
    expect(parseRangeHeader(null, SIZE)).toEqual({ kind: "none" });
    expect(parseRangeHeader("  ", SIZE)).toEqual({ kind: "none" });
  });

  it("parses a closed range", () => {
    expect(parseRangeHeader("bytes=100-199", SIZE)).toEqual({
      kind: "ok",
      start: 100,
      end: 199,
      suffix: false,
    });
  });

  it("clamps an end past EOF", () => {
    expect(parseRangeHeader("bytes=9000-999999", SIZE)).toEqual({
      kind: "ok",
      start: 9000,
      end: 9999,
      suffix: false,
    });
  });

  it("parses an open-ended range", () => {
    expect(parseRangeHeader("bytes=5000-", SIZE)).toEqual({
      kind: "ok",
      start: 5000,
      end: 9999,
      suffix: false,
    });
  });

  it("parses a suffix range (last N bytes)", () => {
    expect(parseRangeHeader("bytes=-500", SIZE)).toEqual({
      kind: "ok",
      start: 9500,
      end: 9999,
      suffix: true,
    });
  });

  it("flags a start at or beyond EOF as unsatisfiable", () => {
    expect(parseRangeHeader("bytes=10000-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseRangeHeader("bytes=99999-100000", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("flags a reversed range as unsatisfiable", () => {
    expect(parseRangeHeader("bytes=200-100", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("reports multi-range separately", () => {
    expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toEqual({ kind: "multi" });
  });

  it("reports unsatisfiable for an empty file", () => {
    expect(parseRangeHeader("bytes=0-1", 0)).toEqual({ kind: "unsatisfiable" });
  });
});

describe("chunk math", () => {
  it("maps a byte to its aligned chunk", () => {
    expect(chunkFor(0, SIZE, 4096)).toEqual({ index: 0, start: 0, end: 4095 });
    expect(chunkFor(4096, SIZE, 4096)).toEqual({ index: 1, start: 4096, end: 8191 });
    expect(chunkFor(9999, SIZE, 4096)).toEqual({ index: 2, start: 8192, end: 9999 });
  });

  it("lists every chunk a range touches", () => {
    const chunks = chunksForRange(4000, 8200, SIZE, 4096);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(chunks[2]).toEqual({ index: 2, start: 8192, end: 9999 });
  });

  it("returns no chunks for an invalid range", () => {
    expect(chunksForRange(200, 100, SIZE, 4096)).toEqual([]);
  });
});

describe("servedWindow", () => {
  it("caps an open-ended request", () => {
    expect(servedWindow({ kind: "none" }, SIZE, 4096)).toEqual({ start: 0, end: 4095 });
  });

  it("caps an oversized closed range", () => {
    expect(
      servedWindow({ kind: "ok", start: 0, end: 9999, suffix: false }, SIZE, 4096),
    ).toEqual({ start: 0, end: 4095 });
  });

  it("keeps the LAST bytes for a suffix range", () => {
    expect(
      servedWindow({ kind: "ok", start: 0, end: 9999, suffix: true }, SIZE, 4096),
    ).toEqual({ start: 5904, end: 9999 });
  });

  it("returns null for multi / unsatisfiable", () => {
    expect(servedWindow({ kind: "multi" }, SIZE, 4096)).toBeNull();
    expect(servedWindow({ kind: "unsatisfiable" }, SIZE, 4096)).toBeNull();
  });
});
