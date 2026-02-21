import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

// Mock isSafeUrl to avoid network dependency and control behavior
mock.module("@/utils/urlSecurity", () => {
    return {
        isSafeUrl: (url: string) => {
            // Simple mock logic matching test cases
            if (url.startsWith("ftp://")) return Promise.resolve(false); // Initial unsupported or redirect unsupported
            if (url === "http://:invalid") return Promise.resolve(false); // Invalid URL

            // Allow http/https for test domains
            if (url.includes("source.com") || url.includes("dest.com") || url.includes("mid.com") || url.includes("next.com")) {
                return Promise.resolve(true);
            }
            return Promise.resolve(false);
        }
    };
});

// Import after mock
import { fetchUpstreamWithRedirects, DEFAULT_UPSTREAM_USER_AGENT } from "./upstreamFetch";

describe("fetchUpstreamWithRedirects", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

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
        // Now using isSafeUrl for redirects too, so message might be about unsupported protocol OR unsafe
        // But isHttpUrl check comes first in upstreamFetch.ts
        expect(e.message).toBe("Upstream redirect location is unsafe or unsupported.");
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
        // Based on implementation, if new URL() throws:
        expect(e.message).toBe("Upstream redirect location is invalid.");
    }
  });

  test("should throw error for initial unsupported protocol", async () => {
    try {
        await fetchUpstreamWithRedirects("ftp://source.com/");
        throw new Error("Should have thrown");
    } catch (e: any) {
        // Updated expectation to match upstreamFetch.ts implementation
        expect(e.message).toBe("Only public HTTP(S) upstream URLs are supported.");
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
