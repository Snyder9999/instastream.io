import { expect, test, describe } from "bun:test";
import { isSafeUrl } from "./urlSecurity";

describe("urlSecurity", () => {
    test("blocks private IPv4 in URL", async () => {
        expect(await isSafeUrl("http://192.168.1.1/foo")).toBe(false);
        expect(await isSafeUrl("http://10.0.0.1/foo")).toBe(false);
        expect(await isSafeUrl("http://127.0.0.1/foo")).toBe(false);
        expect(await isSafeUrl("http://169.254.169.254/foo")).toBe(false);
        expect(await isSafeUrl("http://0.0.0.0/foo")).toBe(false);
        expect(await isSafeUrl("http://172.16.0.1/foo")).toBe(false);
        expect(await isSafeUrl("http://172.31.255.255/foo")).toBe(false);
        // 172.32.0.0 is public
        expect(await isSafeUrl("http://172.32.0.1/foo")).toBe(true);
    });

    test("allows public IPv4 in URL", async () => {
        expect(await isSafeUrl("http://8.8.8.8/foo")).toBe(true);
        expect(await isSafeUrl("http://1.1.1.1/foo")).toBe(true);
    });

    test("blocks private IPv6 in URL", async () => {
        expect(await isSafeUrl("http://[::1]/foo")).toBe(false);
        expect(await isSafeUrl("http://[0:0:0:0:0:0:0:1]/foo")).toBe(false);
        expect(await isSafeUrl("http://[fc00::1]/foo")).toBe(false);
        expect(await isSafeUrl("http://[fe80::1]/foo")).toBe(false);
        expect(await isSafeUrl("http://[::]/foo")).toBe(false);
    });

    test("blocks IPv4-mapped IPv6 in URL", async () => {
        // ::ffff:127.0.0.1
        expect(await isSafeUrl("http://[::ffff:127.0.0.1]/foo")).toBe(false);
        // ::ffff:7f00:1 (hex 127.0.0.1)
        expect(await isSafeUrl("http://[::ffff:7f00:1]/foo")).toBe(false);
        // ::ffff:c0a8:0101 (hex 192.168.1.1)
        expect(await isSafeUrl("http://[::ffff:c0a8:0101]/foo")).toBe(false);

        // Public IPv4 mapped
        // ::ffff:8.8.8.8 -> ::ffff:0808:0808
        expect(await isSafeUrl("http://[::ffff:8.8.8.8]/foo")).toBe(true);
    });

    test("allows public IPv6 in URL", async () => {
        // Google DNS IPv6
        expect(await isSafeUrl("http://[2001:4860:4860::8888]/foo")).toBe(true);
    });

    test("rejects non-http/https protocols", async () => {
        expect(await isSafeUrl("ftp://example.com")).toBe(false);
        expect(await isSafeUrl("file:///etc/passwd")).toBe(false);
        expect(await isSafeUrl("javascript:alert(1)")).toBe(false);
    });

    test("rejects invalid URLs", async () => {
        expect(await isSafeUrl("not-a-url")).toBe(false);
    });

    test("handles non-existent domains gracefully", async () => {
        expect(await isSafeUrl("http://non-existent-domain.invalid")).toBe(false);
    });
});
