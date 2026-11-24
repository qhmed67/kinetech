import { describe, expect, it } from "vitest";

// Synthetic fixtures only: never put a real Drive file id or a real-looking
// browser key in the public repository.
import { directDriveUrl, directSrcHost, redactDirectUrl } from "./driveBrowser";

const FID = "1FakeDriveFileIdForUnitTestsOnly0";
const KEY = "test-only-browser-key";

describe("directDriveUrl", () => {
  it("builds the Drive API media URL with the key", () => {
    expect(directDriveUrl(FID, KEY)).toBe(
      `https://www.googleapis.com/drive/v3/files/${FID}?alt=media&key=${KEY}&supportsAllDrives=true`,
    );
  });

  it("returns null for a missing fid or key", () => {
    expect(directDriveUrl("", KEY)).toBe(null);
    expect(directDriveUrl(FID, "")).toBe(null);
    expect(directDriveUrl("   ", KEY)).toBe(null);
    expect(directDriveUrl(FID, "   ")).toBe(null);
  });
});

describe("redactDirectUrl", () => {
  it("redacts the key — debug output only", () => {
    const src = directDriveUrl(FID, KEY);
    const redacted = redactDirectUrl(src);
    expect(redacted).not.toContain(KEY);
    expect(redacted).toContain("key=<redacted>");
    expect(redactDirectUrl("")).toBe("");
  });
});

describe("directSrcHost", () => {
  it("returns the origin only — never the key", () => {
    expect(directSrcHost(directDriveUrl(FID, KEY))).toBe("https://www.googleapis.com");
    expect(directSrcHost(null)).toBe("");
  });
});
