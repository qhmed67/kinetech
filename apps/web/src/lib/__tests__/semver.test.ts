import { describe, expect, it } from "vitest";
import { compareSemver, isBelowMin } from "../semver";

describe("compareSemver", () => {
  it("orders versions numerically, not lexically", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemver("1.10.0", "1.9.0")).toBe(1);
    expect(compareSemver("2.0.0", "10.0.0")).toBe(-1);
    expect(compareSemver("0.0.1", "0.0.0")).toBe(1);
  });

  it("returns null for unparsable versions", () => {
    expect(compareSemver("", "1.0.0")).toBeNull();
    expect(compareSemver("1.0", "1.0.0")).toBeNull();
    expect(compareSemver("abc", "1.0.0")).toBeNull();
    expect(compareSemver("1.0.0", "nope")).toBeNull();
  });
});

describe("isBelowMin", () => {
  it("is true only for a strictly lower, valid version", () => {
    expect(isBelowMin("1.0.0", "1.0.1")).toBe(true);
    expect(isBelowMin("1.0.1", "1.0.1")).toBe(false);
    expect(isBelowMin("1.0.2", "1.0.1")).toBe(false);
  });

  it("never blocks on an unparsable version (fail-open)", () => {
    expect(isBelowMin("", "1.0.0")).toBe(false);
    expect(isBelowMin("1.0", "1.0.0")).toBe(false);
  });
});
