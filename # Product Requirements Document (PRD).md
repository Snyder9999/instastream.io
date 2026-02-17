# Product Requirements Document (PRD)

**Project Name:** StreamFlow (Web)  
**Core Objective:** A Next.js web application that allows users to instantly stream large video files from direct URLs using custom HTTP range requests, bypassing the need to download the full file locally.

### 1. Features & Capabilities
* **Direct URL Ingestion:** A UI where users can paste long, signed media URLs (e.g., Google user-content URLs).
* **Instant Playback:** Playback initiates within seconds via a chunked streaming backend.
* **Custom Video Player (KMPlayer Web Clone):**
    * Minimalist, custom-built React UI (no default browser controls).
    * Comprehensive desktop-style keyboard shortcut engine (Space, Arrows, Shift+/-, M, F).
    * Volume, seek, and playback speed controls.
* **Dynamic Subtitles:** Integration with the OpenSubtitles REST API to search, select, and inject `.srt` subtitles directly into the video player on the fly.
* **Audio Track Support:** UI capability to switch audio tracks (limited to browser MSE support constraints).

### 2. User Flow
1. **Input:** User pastes a video URL on the landing page and hits "Stream".
2. **Initialization:** The Next.js frontend mounts the custom player and requests the first chunk of video.
3. **Playback:** The user controls playback using KMPlayer-style keyboard shortcuts.
4. **Enhancement:** The user opens a player menu, searches for subtitles (via OpenSubtitles), and selects a language to overlay on the video.

---

# Technical Requirements Document (TRD)

### 1. Tech Stack
* **Framework:** Next.js (App Router).
* **Deployment:** Vercel.
* **Styling:** Tailwind CSS (for the player UI).
* **Core Web API:** HTML5 `<video>`, Media Source Extensions (MSE).
* **External API:** OpenSubtitles REST API v1.

### 2. Overcoming Vercel Limits
Vercel Serverless Functions have strict payload limits. We cannot fetch a massive video on the server and send it to the client in one go.
* **The Solution:** The Next.js Route Handler (`app/api/stream/route.ts`) will act as a lightweight proxy. It will parse the `Range` header sent by the client's player, request *only* that specific byte range from the original source URL, and pipe that exact chunk back to the client using a `206 Partial Content` HTTP status.
* **Next.js App Router Specs:** In Next.js 13+, the Route Handler must return a standard Web Platform `Response` object containing a `ReadableStream`, rather than using Node.js pipes directly.

### 3. OpenSubtitles API Integration
To fetch subtitles dynamically, the frontend will communicate with the OpenSubtitles REST API v1.
* **Authentication:** Requires an `Api-Key` header and a custom `User-Agent` header.
* **Flow:** 1. Search endpoint (`/api/v1/subtitles`).
    2. Download endpoint (`/api/v1/download`).
    3. Frontend converts the downloaded `.srt` text into a `Blob` and attaches it via a `<track>` element.

---

# System Design Document



### 1. Application Architecture
```text
/app
 ├── /api
 │    ├── /stream/route.ts       # Handles proxying HTTP Range requests
 │    └── /subtitles/route.ts    # Securely calls OpenSubtitles API (hides API key)
 ├── /components
 │    ├── PlayerLayout.tsx       # The wrapper for the UI
 │    ├── KMPlayer.tsx           # The core video element + shortcut engine
 │    └── Controls.tsx           # Play, pause, volume, seek sliders
 ├── /utils
 │    ├── mseBufferLogic.ts      # Logic to append chunks and clear 10% back-buffer
 │    └── srtParser.ts           # Converts OpenSubtitle strings to Blob URLs
 └── page.tsx                    # Landing page with URL input

```

### 2. Component Logic: The Streaming Proxy (`/api/stream/route.ts`)

This is the most critical backend component.

* **Input:** Source `url`, `Range` header (e.g., `bytes=0-1048575`).
* **Process:** Fetch the specified chunk from the source using standard Web `fetch`.
* **Output:** Return a standard `Response` object containing the readable stream with the `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes` headers attached.

### 3. Component Logic: The Frontend Buffer (`mseBufferLogic.ts`)

* Creates a `MediaSource` and attaches it to the video tag.
* Tracks `video.currentTime`.
* If `video.currentTime` approaches the end of the loaded buffer, it triggers an API call to `/api/stream` for the next chunk.
* If the buffer gets too large, it removes older chunks, keeping only the recent 10% for seeking.
