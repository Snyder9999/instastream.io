import { describe, it, expect, mock } from "bun:test";
import { isSafeUrl } from "../utils/server-security";

// Mock dns.lookup
mock.module("node:dns/promises", () => {
    return {
        lookup: async (hostname: string) => {
            // Mock specific hostnames
            if (hostname === "localhost") return [{ address: "127.0.0.1", family: 4 }];
            if (hostname === "127.0.0.1") return [{ address: "127.0.0.1", family: 4 }];
            if (hostname === "private-ipv4.com") return [{ address: "192.168.1.1", family: 4 }];
            if (hostname === "public.com") return [{ address: "8.8.8.8", family: 4 }];
            if (hostname === "ipv6-loopback.com") return [{ address: "::1", family: 6 }];
            if (hostname === "ipv6-private.com") return [{ address: "fc00::1", family: 6 }];
            if (hostname === "ipv6-unspecified.com") return [{ address: "::", family: 6 }];
            if (hostname === "zero.com") return [{ address: "0.0.0.0", family: 4 }];
            if (hostname === "ipv6-public.com") return [{ address: "2001:4860:4860::8888", family: 6 }];
            if (hostname === "mixed.com") return [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }];

            // Mock mapped IPv4
            if (hostname === "mapped-ipv4.com") return [{ address: "::ffff:127.0.0.1", family: 6 }];

            throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
        }
    };
});

describe("isSafeUrl", () => {
    it("should allow public HTTP URLs", async () => {
        await expect(isSafeUrl("http://public.com/foo")).resolves.toBeUndefined();
    });

    it("should allow public HTTPS URLs", async () => {
        await expect(isSafeUrl("https://public.com/foo")).resolves.toBeUndefined();
    });

    it("should block localhost hostname", async () => {
        await expect(isSafeUrl("http://localhost:3000")).rejects.toThrow("Access to private IP");
    });

    it("should block 127.0.0.1 IP directly", async () => {
        await expect(isSafeUrl("http://127.0.0.1:3000")).rejects.toThrow("Access to private IP");
    });

    it("should block private IPv4 hostname", async () => {
        await expect(isSafeUrl("http://private-ipv4.com")).rejects.toThrow("Access to private IP");
    });

    it("should block IPv6 loopback hostname", async () => {
        await expect(isSafeUrl("http://ipv6-loopback.com")).rejects.toThrow("Access to private IP");
    });

    it("should block IPv6 unique local hostname", async () => {
        await expect(isSafeUrl("http://ipv6-private.com")).rejects.toThrow("Access to private IP");
    });

    it("should block IPv6 unspecified hostname", async () => {
        await expect(isSafeUrl("http://ipv6-unspecified.com")).rejects.toThrow("Access to private IP");
    });

    it("should block 0.0.0.0 hostname", async () => {
        await expect(isSafeUrl("http://zero.com")).rejects.toThrow("Access to private IP");
    });

    it("should allow public IPv6 hostname", async () => {
        await expect(isSafeUrl("http://ipv6-public.com")).resolves.toBeUndefined();
    });

    it("should block if ANY resolved IP is private", async () => {
        // mixed.com resolves to 8.8.8.8 (public) AND 127.0.0.1 (private)
        await expect(isSafeUrl("http://mixed.com")).rejects.toThrow("Access to private IP");
    });

    it("should block IPv4-mapped IPv6 loopback", async () => {
        await expect(isSafeUrl("http://mapped-ipv4.com")).rejects.toThrow("Access to private IP");
    });

    it("should block non-http protocols", async () => {
        await expect(isSafeUrl("ftp://public.com")).rejects.toThrow("Invalid protocol");
    });

    it("should fail on invalid URL", async () => {
        await expect(isSafeUrl("not-a-url")).rejects.toThrow("Invalid URL format");
    });
});
