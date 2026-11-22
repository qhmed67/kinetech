import { describe, expect, it } from "vitest";
import { scanFaststart } from "../../api/admin/video-meta.ts";

function box(type: string, payloadSize: number): Uint8Array {
  const total = 8 + payloadSize;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, total, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  return out;
}

function concat(...parts: Uint8Array[]): ArrayBuffer {
  const len = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out.buffer;
}

describe("scanFaststart", () => {
  it("accepts ftyp + moov + mdat (moov before mdat)", () => {
    const scan = scanFaststart(concat(box("ftyp", 16), box("moov", 32), box("mdat", 64)));
    expect(scan.faststart).toBe(true);
    expect(scan.mdatBeforeMoov).toBe(false);
    expect(scan.moovOffset).toBe(24);
  });

  it("rejects ftyp + mdat + moov (moov after mdat)", () => {
    const scan = scanFaststart(concat(box("ftyp", 16), box("mdat", 64), box("moov", 32)));
    expect(scan.faststart).toBe(false);
    expect(scan.mdatBeforeMoov).toBe(true);
  });

  it("reports no moov when the window does not contain it", () => {
    const scan = scanFaststart(concat(box("ftyp", 16), box("mdat", 4096)));
    expect(scan.faststart).toBe(false);
    expect(scan.moovOffset).toBeNull();
  });
});
