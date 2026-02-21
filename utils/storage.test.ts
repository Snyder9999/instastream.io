import { describe, expect, test, spyOn } from "bun:test";
import fs from 'node:fs';
import { StorageManager } from "./storage";

describe("StorageManager.generateFilename", () => {
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
});

describe('StorageManager.getFileSize', () => {
    const filename = 'test-file.mp4';

    test('should return the file size when the file exists', async () => {
        const expectedSize = 1024;
        // fs.promises is available on the imported fs module
        const statSpy = spyOn(fs.promises, 'stat').mockResolvedValue({
            size: expectedSize
        } as any);

        const size = await StorageManager.getFileSize(filename);
        expect(size).toBe(expectedSize);
        expect(statSpy).toHaveBeenCalled();

        statSpy.mockRestore();
    });

    test('should return 0 when an error occurs (e.g., file not found)', async () => {
        const statSpy = spyOn(fs.promises, 'stat').mockRejectedValue(new Error('File not found'));

        const size = await StorageManager.getFileSize(filename);
        expect(size).toBe(0);
        expect(statSpy).toHaveBeenCalled();

        statSpy.mockRestore();
    });
});
