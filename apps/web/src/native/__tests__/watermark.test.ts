import { describe, expect, it } from "vitest";
import { isWebToNative, parseMessage } from "@kinetech/bridge";

describe("watermark message", () => {
  it("carries the identity only", () => {
    const msg = parseMessage({
      v: 1,
      type: "watermark",
      email: "student@example.com",
      phoneLast4: "1234",
    });
    expect(msg).toEqual({
      v: 1,
      type: "watermark",
      email: "student@example.com",
      phoneLast4: "1234",
    });
    expect(msg && isWebToNative(msg)).toBe(true);
  });

  it("accepts an empty identity (the page clears the overlay)", () => {
    const msg = parseMessage({ v: 1, type: "watermark", email: "", phoneLast4: "" });
    expect(msg).toEqual({ v: 1, type: "watermark", email: "", phoneLast4: "" });
  });

  it("rejects a malformed identity", () => {
    expect(parseMessage({ v: 1, type: "watermark", email: 42, phoneLast4: "1234" })).toBeNull();
    expect(parseMessage({ v: 1, type: "watermark", email: "a@b.c" })).toBeNull();
  });
});
