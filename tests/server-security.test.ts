import { describe, it, expect, mock } from "bun:test";
import { isPrivateIP, validateUrl } from "../utils/server-security";
import dns from "node:dns";

// Mock dns.lookup
const originalLookup = dns.lookup;

describe("server-security", () => {
    describe("isPrivateIP", () => {
        it("should identify private IPv4 addresses", () => {
            expect(isPrivateIP("127.0.0.1")).toBe(true);
            expect(isPrivateIP("10.0.0.1")).toBe(true);
            expect(isPrivateIP("172.16.0.1")).toBe(true);
            expect(isPrivateIP("172.31.255.255")).toBe(true);
            expect(isPrivateIP("192.168.1.1")).toBe(true);
            expect(isPrivateIP("169.254.1.1")).toBe(true);
            expect(isPrivateIP("0.0.0.0")).toBe(true);
        });

        it("should identify public IPv4 addresses", () => {
            expect(isPrivateIP("8.8.8.8")).toBe(false);
            expect(isPrivateIP("1.1.1.1")).toBe(false);
            expect(isPrivateIP("172.32.0.1")).toBe(false); // Outside 172.16-31 range
            expect(isPrivateIP("192.169.1.1")).toBe(false);
        });

        it("should identify private IPv6 addresses", () => {
            expect(isPrivateIP("::1")).toBe(true);
            expect(isPrivateIP("fc00::1")).toBe(true);
            expect(isPrivateIP("fd00::1")).toBe(true);
            expect(isPrivateIP("fe80::1")).toBe(true);
        });

        it("should identify public IPv6 addresses", () => {
            expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
            expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
        });

        it("should handle IPv4-mapped IPv6 addresses", () => {
            expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
            expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
            expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
        });
    });

    describe("validateUrl", () => {
        // We need to mock dns.lookup for these tests to be deterministic and not rely on network
        // We'll replace the implementation for the scope of these tests

        const mockLookup = (hostname: string, options: any, callback: any) => {
            if (hostname === "google.com") {
                callback(null, [{ address: "8.8.8.8", family: 4 }]);
            } else if (hostname === "localhost") {
                callback(null, [{ address: "127.0.0.1", family: 4 }]);
            } else if (hostname === "private.internal") {
                callback(null, [{ address: "10.0.0.5", family: 4 }]);
            } else if (hostname === "mixed.internal") {
                // Returns one public and one private IP (DNS rebinding / round robin)
                // In our implementation, IF ANY is private, we should probably block or just check the one used?
                // Our implementation checks ALL returned addresses and blocks if ANY is private.
                callback(null, [
                    { address: "8.8.8.8", family: 4 },
                    { address: "127.0.0.1", family: 4 }
                ]);
            } else {
                callback(new Error("ENOTFOUND"), null);
            }
        };

        // @ts-ignore
        dns.lookup = mockLookup;

        it("should allow public URLs", async () => {
            await expect(validateUrl("https://google.com/foo")).resolves.toBeUndefined();
        });

        it("should block localhost URL", async () => {
            await expect(validateUrl("http://localhost:3000")).rejects.toThrow(/private/);
        });

        it("should block private IP literals", async () => {
            await expect(validateUrl("http://127.0.0.1/secret")).rejects.toThrow(/private/);
            await expect(validateUrl("http://[::1]/secret")).rejects.toThrow(/private/);
        });

        it("should block domains resolving to private IP", async () => {
            await expect(validateUrl("http://private.internal/foo")).rejects.toThrow(/private/);
        });

        it("should block domains resolving to mixed IPs (if implemented strictly)", async () => {
            await expect(validateUrl("http://mixed.internal/foo")).rejects.toThrow(/private/);
        });

        it("should reject invalid protocols", async () => {
            await expect(validateUrl("ftp://google.com/file")).rejects.toThrow(/protocol/);
            await expect(validateUrl("file:///etc/passwd")).rejects.toThrow(/protocol/);
        });
    });
});
