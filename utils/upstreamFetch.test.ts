import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { fetchUpstreamWithRedirects } from "./upstreamFetch";

// Mock dns lookup
mock.module("node:dns/promises", () => ({
  lookup: async (hostname: string) => {
    if (hostname === "private.local") {
      return [{ address: "192.168.1.1", family: 4 }];
    }
    if (hostname === "public.com") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    if (hostname === "redirect-to-private.com") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    if (hostname === "redirect-loop.com") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    throw new Error(`DNS resolution failed for ${hostname}`);
  },
}));

// Mock fetch
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = mock(async (url: string | URL | Request) => {
    const urlStr = url.toString();

    if (urlStr.includes("public.com")) {
      return new Response("ok", { status: 200 });
    }

    if (urlStr.includes("redirect-to-private.com")) {
      return new Response(null, {
        status: 302,
        headers: { "Location": "http://private.local/admin" }
      });
    }

    if (urlStr.includes("private.local")) {
        return new Response("secret", { status: 200 });
    }

    return new Response("not found", { status: 404 });
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("fetchUpstreamWithRedirects", () => {
  test("allows public URL", async () => {
    const response = await fetchUpstreamWithRedirects("http://public.com/video.mp4");
    expect(response.status).toBe(200);
  });

  test("blocks initial private URL", async () => {
    await expect(fetchUpstreamWithRedirects("http://private.local/video.mp4"))
      .rejects.toThrow("Resolved to private IP");
  });

  test("blocks redirect to private URL", async () => {
    await expect(fetchUpstreamWithRedirects("http://redirect-to-private.com/video.mp4"))
      .rejects.toThrow("Resolved to private IP");
  });
});
