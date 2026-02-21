import { describe, expect, test } from "bun:test";
import { StorageManager } from "./storage";
import crypto from 'crypto';
import path from 'path';

describe("StorageManager.generateFilename", () => {
  // --- Existing tests from master ---
  test("should preserve allowed extensions", () => {
    const urls = [
      "http://example.com/video.mp4",
      "http://example.com/movie.webm",
      "http://example.com/clip.mkv",
      "http://example.com/film.mov",
      "http://example.com/recording.avi",
      "http://example.com/show.m4v",
      "http://example.com/stream.flv",
    ];

    urls.forEach((url) => {
      const filename = StorageManager.generateFilename(url);
      const ext = "." + filename.split(".").pop();
      // Original extension should be preserved (lowercase check)
      const originalExt = url.split(".").pop()?.toLowerCase();
      expect(ext).toBe("." + originalExt);
    });
  });

  test("should default to .mp4 for disallowed extensions", () => {
    const urls = [
      "http://example.com/malicious.php",
      "http://example.com/script.js",
      "http://example.com/binary.exe",
      "http://example.com/image.png",
      "http://example.com/doc.pdf",
    ];

    urls.forEach((url) => {
      const filename = StorageManager.generateFilename(url);
      expect(filename.endsWith(".mp4")).toBe(true);
      expect(filename.endsWith(".php")).toBe(false);
    });
  });

  test("should default to .mp4 for no extension", () => {
    const url = "http://example.com/video";
    const filename = StorageManager.generateFilename(url);
    expect(filename.endsWith(".mp4")).toBe(true);
  });

  test("should handle query parameters correctly", () => {
    const url = "http://example.com/video.mp4?token=123";
    const filename = StorageManager.generateFilename(url);
    expect(filename.endsWith(".mp4")).toBe(true);
  });

  test("should handle query parameters with disallowed extension", () => {
    const url = "http://example.com/malicious.php?token=123";
    const filename = StorageManager.generateFilename(url);
    expect(filename.endsWith(".mp4")).toBe(true);
  });

  test("should be case insensitive for allowed extensions", () => {
    const url = "http://example.com/VIDEO.MP4";
    const filename = StorageManager.generateFilename(url);
    expect(filename.endsWith(".mp4")).toBe(true);
  });

  // --- New tests added by me ---

  test("should generate correct MD5 hash for filename", () => {
    const url = "http://example.com/video.mp4";
    const filename = StorageManager.generateFilename(url);
    const expectedHash = crypto.createHash('md5').update(url).digest('hex');
    expect(filename).toBe(`${expectedHash}.mp4`);
  });

  test("should produce deterministic filenames", () => {
    const url = "http://example.com/video.mp4";
    const filename1 = StorageManager.generateFilename(url);
    const filename2 = StorageManager.generateFilename(url);
    expect(filename1).toBe(filename2);
  });
});
