import { describe, expect, it } from "vitest";
import { TEST_VECTOR, verifyStreamToken } from "../lib/streamToken";
import { signStreamToken as signPlay } from "../../api/play.ts";
import { signStreamToken as signRefresh } from "../../api/playback/stream-refresh.ts";

/** The Vercel handlers are self-contained copies of the signing code. These
 *  assertions fail if any copy drifts from the shared vector. */
describe("stream token copies", () => {
  it("api/play signs the shared vector", async () => {
    expect(await signPlay(TEST_VECTOR.payload, TEST_VECTOR.secret)).toBe(TEST_VECTOR.token);
  });

  it("api/playback/stream-refresh signs the shared vector", async () => {
    expect(await signRefresh(TEST_VECTOR.payload, TEST_VECTOR.secret)).toBe(TEST_VECTOR.token);
  });

  it("the shared verifier accepts both copies", async () => {
    const a = await signPlay(TEST_VECTOR.payload, TEST_VECTOR.secret);
    const b = await signRefresh(TEST_VECTOR.payload, TEST_VECTOR.secret);
    const outA = await verifyStreamToken(a, TEST_VECTOR.secret);
    const outB = await verifyStreamToken(b, TEST_VECTOR.secret);
    expect(outA.ok).toBe(true);
    expect(outB.ok).toBe(true);
    if (outA.ok) expect(outA.payload.fid).toBe(TEST_VECTOR.fid);
    if (outB.ok) expect(outB.payload.fid).toBe(TEST_VECTOR.fid);
  });
});
