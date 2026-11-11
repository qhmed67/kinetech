import { describe, expect, it } from "vitest";
import { TEST_VECTOR, verifyPlaybackToken } from "@kinetech/playback-token";
import { signPlaybackGrant as signStart } from "../../../api/playback/start";
import { signPlaybackGrant as signRefresh } from "../../../api/playback/refresh";

/* The api functions are SELF-CONTAINED (Vercel's function bundler fails to
 * load workspace packages at runtime), so the signing code exists in three
 * places: packages/playback-token (canonical, used by the Worker) and the two
 * api endpoints. This test is the drift guard: all three must produce the
 * same token for the same payload, and the Worker must accept it. */
describe("playback grant signing (drift guard)", () => {
  it("the start endpoint produces the shared test vector", async () => {
    const token = await signStart(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(token).toBe(TEST_VECTOR.token);
  });

  it("the refresh endpoint produces the same token", async () => {
    const token = await signRefresh(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(token).toBe(TEST_VECTOR.token);
  });

  it("the Worker accepts the token the server signs", async () => {
    const token = await signStart(TEST_VECTOR.payload, TEST_VECTOR.secret);
    const payload = await verifyPlaybackToken(token, TEST_VECTOR.secret, {
      lessonId: TEST_VECTOR.payload.lid,
    });
    expect(payload).toEqual(TEST_VECTOR.payload);
  });

  it("a token signed for one lesson is refused for another", async () => {
    const token = await signStart(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(
      await verifyPlaybackToken(token, TEST_VECTOR.secret, { lessonId: "another-lesson" }),
    ).toBeNull();
  });
});
