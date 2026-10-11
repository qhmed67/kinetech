import { describe, expect, it } from "vitest";
import { extractDriveId, isUsableImageUrl, toDirectImageUrl, toDrivePreviewUrl } from "../drive";

describe("extractDriveId", () => {
  it("parses file/d links", () => {
    expect(extractDriveId("https://drive.google.com/file/d/ABC123_xyz/view?usp=sharing")).toBe("ABC123_xyz");
  });

  it("parses open?id and uc?id links", () => {
    expect(extractDriveId("https://drive.google.com/open?id=ABC123")).toBe("ABC123");
    expect(extractDriveId("https://drive.google.com/uc?id=ABC123&export=download")).toBe("ABC123");
  });

  it("returns null for non-drive input", () => {
    expect(extractDriveId("https://example.com/a.jpg")).toBeNull();
    expect(extractDriveId("")).toBeNull();
  });
});

describe("toDirectImageUrl", () => {
  it("converts share links to lh3 direct URLs", () => {
    expect(toDirectImageUrl("https://drive.google.com/file/d/FILE_ID/view?usp=sharing")).toBe(
      "https://lh3.googleusercontent.com/d/FILE_ID",
    );
  });

  it("passes through plain https and bundled paths", () => {
    expect(toDirectImageUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(toDirectImageUrl("assets/Programming.jpg")).toBe("assets/Programming.jpg");
  });

  it("rejects data URIs and blanks", () => {
    expect(toDirectImageUrl("data:image/png;base64,AAA")).toBe("");
    expect(toDirectImageUrl("   ")).toBe("");
  });
});

describe("isUsableImageUrl", () => {
  it("accepts https and bundled assets, rejects data URIs", () => {
    expect(isUsableImageUrl("https://lh3.googleusercontent.com/d/X")).toBe(true);
    expect(isUsableImageUrl("assets/x.jpg")).toBe(true);
    expect(isUsableImageUrl("data:image/png;base64,AAA")).toBe(false);
    expect(isUsableImageUrl("")).toBe(false);
  });
});

describe("toDrivePreviewUrl", () => {
  it("converts share links to preview embeds", () => {
    expect(toDrivePreviewUrl("https://drive.google.com/file/d/ABC123_xyz/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/ABC123_xyz/preview",
    );
    expect(toDrivePreviewUrl("https://drive.google.com/open?id=ABC123")).toBe(
      "https://drive.google.com/file/d/ABC123/preview",
    );
  });

  it("returns null for non-drive input", () => {
    expect(toDrivePreviewUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toDrivePreviewUrl("")).toBeNull();
  });
});
