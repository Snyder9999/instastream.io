import { describe, it, expect } from "bun:test";
import { parseStartTime } from "@/utils/time";

describe("parseStartTime", () => {
  it("should return \"0\" for null input", () => {
    expect(parseStartTime(null)).toBe("0");
  });

  it("should return \"0\" for empty string", () => {
    expect(parseStartTime("")).toBe("0");
  });

  it("should return \"0\" for whitespace-only string", () => {
    expect(parseStartTime("   ")).toBe("0");
  });

  it("should return the string representation of a valid number", () => {
    expect(parseStartTime("0")).toBe("0");
    expect(parseStartTime("10")).toBe("10");
    expect(parseStartTime("123.456")).toBe("123.456");
  });

  it("should return null for invalid number strings", () => {
    expect(parseStartTime("abc")).toBeNull();
    // parseStartTime uses parseFloat, which parses "10abc" as 10.
    // This test documents the current behavior.
    expect(parseStartTime("10abc")).toBe("10");
  });

  it("should return null for negative numbers", () => {
    expect(parseStartTime("-1")).toBeNull();
    expect(parseStartTime("-0.001")).toBeNull();
  });

  it("should return null for Infinity", () => {
    expect(parseStartTime("Infinity")).toBeNull();
    expect(parseStartTime("-Infinity")).toBeNull();
  });

  it("should handle large numbers correctly", () => {
    const largeNumber = "1234567890";
    expect(parseStartTime(largeNumber)).toBe(largeNumber);
  });
});
