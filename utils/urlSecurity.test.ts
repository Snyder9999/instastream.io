import { describe, expect, test, mock } from "bun:test";
import { isPrivateIp, validateUrl } from "./urlSecurity";

// Mock dns lookup
mock.module("node:dns/promises", () => ({
  lookup: async (hostname: string, options: any) => {
    if (hostname === "private.local") {
      return [{ address: "192.168.1.1", family: 4 }];
    }
    if (hostname === "public.com") {
      return [{ address: "8.8.8.8", family: 4 }];
    }
    if (hostname === "localhost-ipv6") {
      return [{ address: "::1", family: 6 }];
    }
    if (hostname === "mixed.local") {
         return [
             { address: "8.8.8.8", family: 4 },
             { address: "192.168.1.1", family: 4 }
         ];
    }
    throw new Error("DNS resolution failed");
  },
}));

describe("isPrivateIp", () => {
  test("identifies private IPv4 addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.10.10")).toBe(true);
  });

  test("identifies public IPv4 addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("142.250.190.46")).toBe(false);
  });

  test("identifies private IPv6 addresses", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  test("identifies public IPv6 addresses", () => {
    expect(isPrivateIp("2607:f8b0:4005:805::200e")).toBe(false);
  });

  test("identifies IPv4-mapped IPv6 addresses", () => {
      expect(isPrivateIp("::ffff:192.168.1.1")).toBe(true);
      expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("validateUrl", () => {
  test("allows public IP", async () => {
    await expect(validateUrl("http://8.8.8.8")).resolves.toBeUndefined();
  });

  test("blocks private IP", async () => {
    await expect(validateUrl("http://192.168.1.1")).rejects.toThrow("Private IP address not allowed");
  });

  test("allows public hostname", async () => {
    await expect(validateUrl("http://public.com")).resolves.toBeUndefined();
  });

  test("blocks hostname resolving to private IP", async () => {
    await expect(validateUrl("http://private.local")).rejects.toThrow("Resolved to private IP");
  });

  test("blocks hostname resolving to mixed public/private IPs", async () => {
      await expect(validateUrl("http://mixed.local")).rejects.toThrow("Resolved to private IP");
  });

  test("blocks localhost IPv6", async () => {
      await expect(validateUrl("http://[::1]")).rejects.toThrow("Private IP address not allowed");
      await expect(validateUrl("http://localhost-ipv6")).rejects.toThrow("Resolved to private IP");
  });

  test("rejects invalid URL", async () => {
    await expect(validateUrl("not-a-url")).rejects.toThrow("Invalid URL");
  });

  test("rejects non-http protocol", async () => {
    await expect(validateUrl("ftp://8.8.8.8")).rejects.toThrow("Invalid protocol");
  });
});
