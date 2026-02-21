
import { test, expect, beforeAll, afterAll, mock } from "bun:test";
import path from "path";
import fs from "fs";
import { NextRequest } from "next/server";

// Mock DB before importing route
const TEST_URL = "http://example.com/test-perf.mp4";
const TEST_FILENAME = "test-perf.mp4";
const MISSING_FILENAME = "missing.mp4";
const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
const TEST_FILEPATH = path.join(DOWNLOAD_DIR, TEST_FILENAME);
const MISSING_FILEPATH = path.join(DOWNLOAD_DIR, MISSING_FILENAME);

mock.module("@/db", () => {
    return {
        default: {
            prepare: () => {
                const stmt = {
                    get: (url: string) => {
                        if (url === TEST_URL) {
                            return {
                                id: 1,
                                url: TEST_URL,
                                filename: TEST_FILENAME,
                                filepath: TEST_FILEPATH,
                                status: "completed",
                                size: 13,
                                downloaded: 13
                            };
                        }
                        if (url === "http://example.com/missing.mp4") {
                             return {
                                id: 2,
                                url: "http://example.com/missing.mp4",
                                filename: MISSING_FILENAME,
                                filepath: MISSING_FILEPATH,
                                status: "completed", // DB says completed
                                size: 10,
                                downloaded: 10
                            };
                        }
                        return undefined;
                    },
                    run: () => ({ lastInsertRowid: 1 })
                };
                return stmt;
            }
        }
    };
});

let GET: (req: NextRequest) => Promise<Response>;

// Mock global fetch
const originalFetch = global.fetch;
global.fetch = mock((url) => {
    // Check if the URL string matches expected missing URL
    // url can be string or Request object.
    const urlString = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));

    if (urlString === "http://example.com/missing.mp4") {
        return Promise.resolve(new Response("upstream content", { status: 200 }));
    }
    return Promise.reject("Network Error");
}) as unknown as typeof fetch;

beforeAll(async () => {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }
    fs.writeFileSync(TEST_FILEPATH, "dummy content");

    // Import route dynamically
    const mod = await import("./route");
    GET = mod.GET as (req: NextRequest) => Promise<Response>;
});

afterAll(() => {
    if (fs.existsSync(TEST_FILEPATH)) {
        fs.unlinkSync(TEST_FILEPATH);
    }
    // Restore fetch
    global.fetch = originalFetch;
});

test("GET /api/download-stream serves completed file", async () => {
    const req = new NextRequest(`http://localhost/api/download-stream?url=${encodeURIComponent(TEST_URL)}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("dummy content");
});

test("GET fallback to download when file missing despite DB status", async () => {
    // Ensure file is missing
    if (fs.existsSync(MISSING_FILEPATH)) fs.unlinkSync(MISSING_FILEPATH);

    const req = new NextRequest(`http://localhost/api/download-stream?url=${encodeURIComponent("http://example.com/missing.mp4")}`);

    // This should trigger the catch block and fall through to fetch
    const res = await GET(req);

    expect(res.status).toBe(200);
    // Use .headers.get() which is standard Web API
    expect(res.headers.get("X-InstaStream-Source")).toBe("upstream-tee");

    // Clean up
    if (fs.existsSync(MISSING_FILEPATH)) fs.unlinkSync(MISSING_FILEPATH);
});
