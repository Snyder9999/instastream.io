import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import http from "http";

// Mock the DB module to avoid native module issues and DB writes
mock.module("@/db", () => {
  return {
    default: {
      prepare: () => ({
        get: () => undefined, // Simulates no existing video
        run: () => ({ lastInsertRowid: 123 }), // Simulates successful insert
      }),
    },
  };
});

// Mock StorageManager to avoid file system operations
mock.module("@/utils/storage", () => {
    return {
        StorageManager: {
            ensureDirectory: () => {},
            generateFilename: (url: string) => "mock-file.mp4",
            getFilePath: (filename: string) => `/tmp/${filename}`,
            fileExists: () => Promise.resolve(false), // Updated to match async signature in upstream if changed?
            // Upstream code uses `await StorageManager.fileExists` now?
            // Let's check upstream code again.
            // app/api/download-stream/route.ts:27: if (video ... && await StorageManager.fileExists(video.filename))
            // Yes, it awaits it.
        }
    }
});

// Mock NextRequest
class MockNextRequest {
    public nextUrl: URL;
    public headers: Headers;

    constructor(url: string, init?: RequestInit) {
        this.nextUrl = new URL(url);
        this.headers = new Headers(init?.headers);
    }
}

describe("SSRF Vulnerability Reproduction", () => {
  let server: http.Server;
  let port: number;
  let localUrl: string;
  let GET: any;

  beforeAll(async () => {
    // Dynamic import to allow mocks to take effect
    // We need to re-import or use `require` to get a fresh module if it was cached?
    // In bun test, imports are cached. But this is a new test file run.
    const mod = await import("../app/api/download-stream/route");
    GET = mod.GET;

    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Secret Internal Data");
      });
      server.listen(0, "127.0.0.1", () => {
        // @ts-ignore
        port = server.address().port;
        localUrl = `http://127.0.0.1:${port}/secret`;
        console.log(`Test server running at ${localUrl}`);
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it("should block access to local network resources", async () => {
    // @ts-expect-error - Mocking NextRequest
    const req = new MockNextRequest(`http://localhost:3000/api/download-stream?url=${encodeURIComponent(localUrl)}`);

    const res = await GET(req);

    // Read the stream
    let text = "";
    if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } else {
        text = await res.text();
    }

    console.log("Status:", res.status);
    console.log("Body:", text);

    // Expectation: Blocking SSRF
    // It should fail with 500 (Internal Error) because the upstream fetch throws an error caught in the route handler.
    // Or it might return "Upstream Error" if status is not ok?
    // In fetchUpstreamWithRedirects, it throws Error if validation fails.
    // The route handler catches it:
    // catch (e) { console.error('Download Setup Error:', e); return new NextResponse('Internal Error', { status: 500 }); }

    expect(res.status).toBe(500);
    expect(text).toContain("Internal Error");
    // Optionally check logs or specific error message if exposed, but "Internal Error" is what the client sees.
  });
});
