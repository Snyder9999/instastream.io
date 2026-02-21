import { expect, test, describe } from "bun:test";
import { isValidStreamIndex } from "./validation";

describe("isValidStreamIndex", () => {
  test("should accept valid non-negative integers", () => {
    expect(isValidStreamIndex("0")).toBe(true);
    expect(isValidStreamIndex("1")).toBe(true);
    expect(isValidStreamIndex("10")).toBe(true);
    expect(isValidStreamIndex("999999")).toBe(true);
  });

  test("should reject negative numbers", () => {
    expect(isValidStreamIndex("-1")).toBe(false);
    expect(isValidStreamIndex("-10")).toBe(false);
  });

  test("should reject floats", () => {
    expect(isValidStreamIndex("1.5")).toBe(false);
    expect(isValidStreamIndex("0.0")).toBe(false);
  });

  test("should reject non-numeric strings", () => {
    expect(isValidStreamIndex("abc")).toBe(false);
    expect(isValidStreamIndex("")).toBe(false);
    expect(isValidStreamIndex(" ")).toBe(false);
  });

  test("should reject null", () => {
    expect(isValidStreamIndex(null)).toBe(false);
  });

  test("should reject injection attempts", () => {
    expect(isValidStreamIndex("0; -vf scale=640:480")).toBe(false);
    expect(isValidStreamIndex("0'")).toBe(false);
    expect(isValidStreamIndex("0\n")).toBe(false);
    expect(isValidStreamIndex("0 ")).toBe(false);
  });
});
