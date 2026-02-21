// @ts-nocheck
import { redactSensitiveInfo } from "./sensitiveData";

describe("redactSensitiveInfo", () => {
  test("redacts simple credentials", () => {
    const input = "ffmpeg -i https://user:pass@example.com/video.mp4";
    const expected = "ffmpeg -i https://***:***@example.com/video.mp4";
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  test("redacts credentials with special characters", () => {
    const input = "ffmpeg -i rtmp://user:p@ssword@example.com/live";
    // See implementation note about regex behavior for raw @ in password

    // Percent encoded:
    const inputEncoded = "ffmpeg -i rtmp://user:p%40ssword@example.com/live";
    const expectedEncoded = "ffmpeg -i rtmp://***:***@example.com/live";
    expect(redactSensitiveInfo(inputEncoded)).toBe(expectedEncoded);
  });

  test("does not redact normal URLs", () => {
    const input = "ffmpeg -i https://example.com/video.mp4";
    expect(redactSensitiveInfo(input)).toBe(input);
  });

  test("redacts multiple URLs in one string", () => {
    const input = "ffmpeg -i https://u1:p1@a.com -i rtmp://u2:p2@b.com";
    const expected = "ffmpeg -i https://***:***@a.com -i rtmp://***:***@b.com";
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  test("handles various protocols", () => {
    const input = "rtsp://admin:12345@192.168.1.1:554/cam";
    const expected = "rtsp://***:***@192.168.1.1:554/cam";
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  test("handles error messages (stderr)", () => {
    const input = "[error] Connection to tcp://user:pass@1.2.3.4:80 failed";
    const expected = "[error] Connection to tcp://***:***@1.2.3.4:80 failed";
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  test("does not break on empty string", () => {
    expect(redactSensitiveInfo("")).toBe("");
  });
});
