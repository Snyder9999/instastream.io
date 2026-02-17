# Project Status & Handoff Report: StreamFlow
**Date:** 2026-02-17
**Current State:** Phase 8 - Transcoding Pipeline Hardening (Implemented)

## ✅ IMPLEMENTED UPDATE: Streaming + Transcoding Stability Patch
**Severity:** Critical issue addressed

**What was fixed:**
1. Added shared URL normalization and media preflight validation in `utils/mediaUrl.ts`.
2. `video-seed.dev/?url=...` wrapper URLs are now auto-unwrapped before proxy/transcode.
3. Non-media/HTML source responses now fail fast with `422` JSON (`SOURCE_NOT_MEDIA`).
4. `/api/transcode` now performs FFmpeg lifecycle cleanup on request abort and stream close/error.
5. Added transcode concurrency guardrail (`MAX_ACTIVE_TRANSCODES`, default `2`) with `429` response when saturated.
6. `/api/stream` no longer spoofs MKV as MP4 and now supports no-Range pass-through.
7. `KMPlayer` now uses explicit fallback order: `direct -> proxy -> transcode -> failed`.
8. Player now surfaces route diagnostic messages instead of opaque alerts.

**Operational impact:**
- Prevents repeated runaway FFmpeg workers during retries.
- Makes wrapper/non-media URL failures explicit and debuggable.
- Reduces false-positive playback behavior caused by MIME spoofing.

---

## 1. Project Overview
**Application:** StreamFlow - A web-based video streaming interface.
**Goal:** Stream video files (MP4, MKV, etc.) from remote URLs directly in the browser, bypassing CORS restrictions and format incompatibilities.

**Tech Stack:**
- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **Transcoding:** `fluent-ffmpeg` (Server-side) running on Node.js
- **Player:** Native HTML5 `<video>` tag (currently). Plans for MSE (Media Source Extensions) in future phases.

**Architecture:**
- **Frontend ([KMPlayer.tsx](file:///d:/codebay/instanstream.io/components/KMPlayer.tsx)):** A smart player that tries Direct Play -> Proxy -> Transcoding (fallback).
- **Proxy (`/api/stream`):** Handles Range requests for standard formats (MP4) to bypass basic CORS/Referer checks.
- **Transcoder (`/api/transcode`):** Real-time FFmpeg pipeline that converts MKV/unsupported codecs to fragmented MP4 (H.264/AAC) for browser streaming.

---

## 2. Timeline of Changes & Iterations
1. **Initial Proxy:** Implemented `/api/stream` to proxy Google Video URLs. Fixed `Content-Disposition` header issue to prevent forced downloads.
2. **Direct Play Optimization:** Updated player to use direct URL if CORS allows, falling back to proxy.
3. **MKV Support (Phase 8):**
   - Implemented `/api/transcode` using `fluent-ffmpeg`.
   - Tuned for low latency (`ultrafast`, `zerolatency`, `frag_keyframe`).
   - Updated [KMPlayer](file:///d:/codebay/instanstream.io/components/KMPlayer.tsx#9-111) to detect `MEDIA_ERR_SRC_NOT_SUPPORTED` (Code 4) and auto-switch to transcoding.
4. **Debugging Transcoding:**
   - **Issue:** Video wouldn't play.
   - **Fix 1:** Added verbose logging to `transcode.log`. confirmed FFmpeg was running.
   - **Fix 2:** Removed `-re` input flag (Rate Emulation) to allow transcoding faster than real-time.
   - **Fix 3:** Added `-reset_timestamps 1`, `-pix_fmt yuv420p` (force 8-bit), and `-g 30` (keyframe interval) to fix potential codec incompatibilities.
   - **Result:** Error persists.

---

## 3. Key File Documentation

### [app/api/transcode/route.ts](file:///d:/codebay/instanstream.io/app/api/transcode/route.ts)
**Status:** **Active / Debugging**
**Purpose:** Spawns FFmpeg to convert input URL to fragmented MP4.
**Key Config:**
- Input: `srcUrl`
- Output: Pipe `stdout` to response.
- Flags: `ultrafast`, `zerolatency`, `yuv420p` (crucial for browser support), `frag_keyframe+empty_moov+default_base_moof`.
**Logs:** Writes to `transcode.log` in project root.

### [components/KMPlayer.tsx](file:///d:/codebay/instanstream.io/components/KMPlayer.tsx)
**Status:** **Active / Debugging**
**Purpose:** Video player component.
**Logic:**
- Attempts standard `<video src={directUrl}>`.
- Listens for `error` event.
- If `error.code === 4` (Not Supported) AND not already transcoding -> Switches `src` to `/api/transcode?url=...` and reloads.
- Includes a `key={finalUrl}` to force React to re-mount the video element on source switch.

### [app/api/stream/route.ts](file:///d:/codebay/instanstream.io/app/api/stream/route.ts)
**Status:** Stable
**Purpose:** Pass-through proxy for MP4 files. Handles `Range` headers correctly.

### `transcode.log`
**Status:** Log file (gitignored equivalent) containing FFmpeg stdout/stderr. **CRITICAL for debugging.**

---

## 4. Environment & Dependencies
- **Node.js:** v18+ (Required for Next.js 14)
- **FFmpeg:** Must be installed on the system path.
- **Dependencies:**
  - `fluent-ffmpeg`
  - `next`, `react`, `react-dom`
- **Setup:**
  1. `npm install`
  2. Ensure `ffmpeg` is in consumer's PATH.
  3. `npm run dev`

---

## 5. Next Steps for Incoming Agent

### Immediate Investigation
1. **Validate Source URL:** The test URL in the User's command history (`curl ...`) is a Google Video URL. These expire quickly. **Verify the URL is still accessible** by running `curl -I "URL"` from the terminal. If it returns 403 or 410, that is the root cause.
2. **Analyze `transcode.log`:** Read the *end* of this file. If you see `Error opening input: Server returned 403 Forbidden (access denied)`, the URL is dead.
3. **Hard-Code a Known Good Test:** Temporarily replace the input URL in [KMPlayer](file:///d:/codebay/instanstream.io/components/KMPlayer.tsx#9-111) with a stable, permanent MKV test file (e.g., http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4 - wait, that's MP4. Find a public MKV sample or use a stable generated one).

### Proposed Fixes
- **If URL is dead:** Ask user for a fresh, valid MKV link.
- **If URL is alive but playback fails:**
  - Try removing the `frag_keyframe` flag and use standard mp4 output *if* using a simpler test, but for streaming, `frag_keyframe` is required.
  - Inspect the *network tab* behavior (via instructions to user) to see if the response is 200 OK and if bytes are transferring.
  - Consider adding `video/mp4` MIME type explicitly to the `source` tag in [KMPlayer](file:///d:/codebay/instanstream.io/components/KMPlayer.tsx#9-111) when switching to transcoding.

### Code Snippet: Current Transcoding Command
```typescript
const ffmpegCommand = ffmpeg(url)
    .inputOptions([
        `-ss ${startTime}`,
        // No -re flag
    ])
    .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-tune zerolatency',
        '-pix_fmt yuv420p', // Force 8-bit
        '-g 30',          // Keyframes
        '-sc_threshold 0',
        '-c:a aac',
        '-ac 2',
        '-f mp4',
        '-movflags frag_keyframe+empty_moov+default_base_moof',
        '-reset_timestamps 1',
    ]);
```
