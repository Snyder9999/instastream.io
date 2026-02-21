import { expect, test, describe } from "bun:test";
import { normalizeMediaUrl, MediaValidationError } from "@/utils/mediaUrl";

describe("normalizeMediaUrl", () => {
  const VALID_DIRECT_URL = "https://example.com/video.mp4";
  const INNER_URL = "http://storage.com/movie.mkv";
  const WRAPPER_HOST = "video-seed.dev";
  const WRAPPER_URL = `https://${WRAPPER_HOST}/?url=${encodeURIComponent(INNER_URL)}`;

  test("should return the same URL for non-wrapped hosts", () => {
    const result = normalizeMediaUrl(VALID_DIRECT_URL);
    expect(result).toEqual({
      normalizedUrl: VALID_DIRECT_URL,
      wasWrapped: false,
    });
  });

  test("should extract the inner URL for wrapped hosts (video-seed.dev)", () => {
    const result = normalizeMediaUrl(WRAPPER_URL);
    expect(result).toEqual({
      normalizedUrl: INNER_URL,
      wasWrapped: true,
      wrapperHost: WRAPPER_HOST,
    });
  });

  test("should extract the inner URL for wrapped hosts (www.video-seed.dev)", () => {
    const wwwWrapperUrl = `https://www.video-seed.dev/?url=${encodeURIComponent(INNER_URL)}`;
    const result = normalizeMediaUrl(wwwWrapperUrl);
    expect(result).toEqual({
      normalizedUrl: INNER_URL,
      wasWrapped: true,
      wrapperHost: "www.video-seed.dev",
    });
  });

  test("should handle URL decoding in the url parameter", () => {
    const encodedInner = "https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue";
    const decodedInner = "https://example.com/path?query=value";
    const wrapperUrl = `https://${WRAPPER_HOST}/?url=${encodedInner}`;
    const result = normalizeMediaUrl(wrapperUrl);
    expect(result.normalizedUrl).toBe(decodedInner);
  });

  test("should handle double-encoded URL parameters (due to redundant decoding)", () => {
    const innerUrl = "https://example.com/video.mp4";
    const doubleEncoded = encodeURIComponent(encodeURIComponent(innerUrl));
    const wrapperUrl = `https://${WRAPPER_HOST}/?url=${doubleEncoded}`;

    const result = normalizeMediaUrl(wrapperUrl);
    expect(result.normalizedUrl).toBe(innerUrl);
    expect(result.wasWrapped).toBe(true);
  });

  test("should throw MediaValidationError for invalid top-level URLs", () => {
    expect(() => normalizeMediaUrl("not-a-url")).toThrow(MediaValidationError);
    try {
      normalizeMediaUrl("not-a-url");
    } catch (e: any) {
      expect(e.code).toBe("INVALID_URL");
      expect(e.status).toBe(400);
    }
  });

  test("should throw MediaValidationError when wrapped URL is missing 'url' parameter", () => {
    const missingUrl = `https://${WRAPPER_HOST}/?other=param`;
    expect(() => normalizeMediaUrl(missingUrl)).toThrow(MediaValidationError);
    try {
      normalizeMediaUrl(missingUrl);
    } catch (e: any) {
      expect(e.code).toBe("WRAPPER_URL_MISSING_INNER_URL");
      expect(e.status).toBe(400);
    }
  });

  test("should throw MediaValidationError when inner URL is invalid", () => {
    const invalidInnerUrl = `https://${WRAPPER_HOST}/?url=not-a-url`;
    expect(() => normalizeMediaUrl(invalidInnerUrl)).toThrow(MediaValidationError);
    try {
      normalizeMediaUrl(invalidInnerUrl);
    } catch (e: any) {
      expect(e.code).toBe("INVALID_URL");
      expect(e.status).toBe(400);
    }
  });

  test("should be case-insensitive for the wrapper host", () => {
    const upperWrapperUrl = `https://VIDEO-SEED.DEV/?url=${encodeURIComponent(INNER_URL)}`;
    const result = normalizeMediaUrl(upperWrapperUrl);
    expect(result).toEqual({
      normalizedUrl: INNER_URL,
      wasWrapped: true,
      wrapperHost: "video-seed.dev",
    });
  });
});
