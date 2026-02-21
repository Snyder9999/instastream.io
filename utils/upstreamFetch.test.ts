import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { fetchUpstreamWithRedirects, DEFAULT_UPSTREAM_USER_AGENT } from "./upstreamFetch";

// Mock dns lookup - needed for validateUrl which is called by fetchUpstreamWithRedirects
mock.module("node:dns/promises", () => ({
  lookup: async (hostname: string) => {
    // Domains from my tests
    if (hostname === "private.local") return [{ address: "192.168.1.1", family: 4 }];
    if (hostname === "public.com") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "redirect-to-private.com") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "redirect-loop.com") return [{ address: "93.184.216.34", family: 4 }];

    // Domains from master's tests
    if (["source.com", "dest.com", "mid.com", "next.com"].includes(hostname)) {
      return [{ address: "8.8.8.8", family: 4 }]; // Public IP
    }

    throw new Error(`DNS resolution failed for ${hostname}`);
  },
}));

describe("fetchUpstreamWithRedirects", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // --- Tests from my implementation (Security) ---

  test("allows public URL (security check)", async () => {
    global.fetch = mock(async () => new Response("ok", { status: 200 }));
    const response = await fetchUpstreamWithRedirects("http://public.com/video.mp4");
    expect(response.status).toBe(200);
  });

  test("blocks initial private URL", async () => {
     // No fetch mock needed as it should fail before fetch, but good to have one
     global.fetch = mock(async () => new Response("secret", { status: 200 }));
     await expect(fetchUpstreamWithRedirects("http://private.local/video.mp4"))
      .rejects.toThrow("Resolved to private IP");
  });

  test("blocks redirect to private URL", async () => {
    global.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("redirect-to-private.com")) {
            return new Response(null, {
                status: 302,
                headers: { "Location": "http://private.local/admin" }
            });
        }
        return new Response("ok", { status: 200 });
    });

    await expect(fetchUpstreamWithRedirects("http://redirect-to-private.com/video.mp4"))
      .rejects.toThrow("Resolved to private IP");
  });

  // --- Tests from master (Logic) ---

  test("should return 200 OK response directly", async () => {
    const mockFetch = mock(async () => {
      return new Response("ok", { status: 200 });
    });
    global.fetch = mockFetch;

    const response = await fetchUpstreamWithRedirects("http://source.com/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("should follow a single 302 redirect", async () => {
    const mockFetch = mock(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "http://source.com/") {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://dest.com/" },
        });
      }
      if (url === "http://dest.com/") {
        return new Response("ok", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });
    global.fetch = mockFetch;

    const response = await fetchUpstreamWithRedirects("http://source.com/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("should follow multiple redirects", async () => {
    const mockFetch = mock(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "http://source.com/") {
        return new Response(null, { status: 301, headers: { Location: "http://mid.com/" } });
      }
      if (url === "http://mid.com/") {
        return new Response(null, { status: 302, headers: { Location: "http://dest.com/" } });
      }
      if (url === "http://dest.com/") {
        return new Response("final", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });
    global.fetch = mockFetch;

    const response = await fetchUpstreamWithRedirects("http://source.com/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("final");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("should throw error when max redirects exceeded", async () => {
    const mockFetch = mock(async () => {
      return new Response(null, { status: 302, headers: { Location: "http://next.com/" } });
    });
    global.fetch = mockFetch;

    // Use try-catch to verify error message as bun:test sometimes behaves differently with async rejects
    try {
        await fetchUpstreamWithRedirects("http://source.com/", { maxRedirects: 1 });
        throw new Error("Should have thrown");
    } catch (e: any) {
        expect(e.message).toBe("Too many upstream redirects.");
    }
  });

  test("should throw error for unsupported protocol in redirect", async () => {
    const mockFetch = mock(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "http://source.com/") {
        return new Response(null, { status: 302, headers: { Location: "ftp://dest.com/" } });
      }
      return new Response("ok", { status: 200 });
    });
    global.fetch = mockFetch;

    try {
        await fetchUpstreamWithRedirects("http://source.com/");
        throw new Error("Should have thrown");
    } catch (e: any) {
        expect(e.message).toBe("Upstream redirect uses an unsupported protocol.");
    }
  });

  test("should return 3xx response if location header is missing", async () => {
    const mockFetch = mock(async () => {
      return new Response(null, { status: 302 });
    });
    global.fetch = mockFetch;

    const response = await fetchUpstreamWithRedirects("http://source.com/");
    expect(response.status).toBe(302);
  });

  test("should throw error for invalid redirect location", async () => {
    const mockFetch = mock(async (input: RequestInfo | URL) => {
        if (input.toString() === "http://source.com/") {
             return new Response(null, { status: 302, headers: { Location: "http://:invalid" } });
        }
        return new Response("ok", { status: 200 });
    });
    global.fetch = mockFetch;

    try {
        await fetchUpstreamWithRedirects("http://source.com/");
        throw new Error("Should have thrown");
    } catch (e: any) {
        expect(e.message).toBe("Upstream redirect location is invalid.");
    }
  });

  test("should throw error for initial unsupported protocol", async () => {
    try {
        await fetchUpstreamWithRedirects("ftp://source.com/");
        throw new Error("Should have thrown");
    } catch (e: any) {
        expect(e.message).toBe("Only HTTP(S) upstream URLs are supported.");
    }
  });

  test("should send correct headers", async () => {
    const mockFetch = mock(async () => {
      return new Response("ok", { status: 200 });
    });
    global.fetch = mockFetch;

    await fetchUpstreamWithRedirects("http://source.com/", { range: "bytes=0-100" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://source.com/");

    const headers = options?.headers as Headers;
    expect(headers.get("User-Agent")).toBe(DEFAULT_UPSTREAM_USER_AGENT);
    expect(headers.get("Range")).toBe("bytes=0-100");
    expect(headers.get("Referer")).toBe("http://source.com/");
  });
});
