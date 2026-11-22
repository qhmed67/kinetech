import { describe, expect, it } from "vitest";
import {
  drivePreviewUrl,
  extractDriveFileId,
  extractYoutubeVideoId,
  isValidDriveFileId,
  isValidYoutubeVideoId,
} from "./driveLinks";

describe("extractDriveFileId", () => {
  it("accepts /file/d/<id>/view", () => {
    expect(
      extractDriveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz01234/view?usp=sharing"),
    ).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz01234");
  });

  it("accepts /open?id=", () => {
    expect(extractDriveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz01234")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUvWxYz01234",
    );
  });

  it("accepts /uc?id= with extra params in any order", () => {
    expect(extractDriveFileId("https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOpQrStUvWxYz01234&export=download")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUvWxYz01234",
    );
    expect(extractDriveFileId("https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz01234")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUvWxYz01234",
    );
  });

  it("rejects unrelated and empty links", () => {
    expect(extractDriveFileId("")).toBeNull();
    expect(extractDriveFileId("https://example.com/file/d/abc")).toBeNull();
    expect(extractDriveFileId("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});

describe("drive id validation", () => {
  it("requires an opaque id, not a URL", () => {
    expect(isValidDriveFileId("1AbCdEfGhIjKlMnOpQrStUvWxYz01234")).toBe(true);
    expect(isValidDriveFileId("https://drive.google.com/file/d/x/view")).toBe(false);
    expect(isValidDriveFileId("short")).toBe(false);
  });

  it("builds the preview URL from either form", () => {
    expect(drivePreviewUrl("1AbCdEfGhIjKlMnOpQrStUvWxYz01234")).toBe(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz01234/preview",
    );
    expect(drivePreviewUrl("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz01234")).toBe(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz01234/preview",
    );
    expect(drivePreviewUrl("")).toBeNull();
  });
});

describe("extractYoutubeVideoId", () => {
  it("accepts every common form", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      expect(extractYoutubeVideoId(link)).toBe("dQw4w9WgXcQ");
    }
  });

  it("rejects non-YouTube and bad ids", () => {
    expect(extractYoutubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(extractYoutubeVideoId("short")).toBeNull();
    expect(isValidYoutubeVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isValidYoutubeVideoId("too-long-idx")).toBe(false);
  });
});
