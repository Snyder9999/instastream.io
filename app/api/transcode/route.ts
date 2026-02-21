import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";

import {
  assertMediaLikeSource,
  MediaValidationError,
  normalizeMediaUrl,
} from "@/utils/mediaUrl";
import { redactSensitiveInfo } from "@/utils/sensitiveData";
import { buildUpstreamReferer, DEFAULT_UPSTREAM_USER_AGENT } from "@/utils/upstreamFetch";
import { parseStartTime } from "@/utils/time";
import { isValidStreamIndex } from "@/utils/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const logPath = path.join(process.cwd(), "transcode.log");
const parsedCap = Number.parseInt(process.env.MAX_ACTIVE_TRANSCODES ?? "4", 10);
const MAX_ACTIVE_TRANSCODES = Number.isNaN(parsedCap) || parsedCap < 1 ? 4 : parsedCap;
let activeTranscodes = 0;

type ErrorBody = {
  code: string;
  message: string;
  sourceUrl?: string;
  normalizedUrl?: string;
  requestId?: string;
  activeTranscodes?: number;
  maxActiveTranscodes?: number;
};

async function logLine(line: string) {
  try {
    await appendFile(logPath, line);
  } catch {
    // Logging must never crash the request path.
  }
}

function jsonError(status: number, body: ErrorBody) {
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  const sourceUrl = req.nextUrl.searchParams.get("url");
  const startTime = parseStartTime(req.nextUrl.searchParams.get("time"));
  // Audio and Subtitle indices are global stream indices (from ffprobe)
  const audioIndex = req.nextUrl.searchParams.get("audioIndex");
  const subtitleIndex = req.nextUrl.searchParams.get("subtitleIndex");

  if (audioIndex !== null && !isValidStreamIndex(audioIndex)) {
    return jsonError(400, {
      code: "INVALID_STREAM_INDEX",
      message: "Stream index must be a non-negative integer.",
      sourceUrl: sourceUrl ?? undefined,
    });
  }

  if (subtitleIndex !== null && !isValidStreamIndex(subtitleIndex)) {
    return jsonError(400, {
      code: "INVALID_STREAM_INDEX",
      message: "Stream index must be a non-negative integer.",
      sourceUrl: sourceUrl ?? undefined,
    });
  }

  if (!sourceUrl) {
    return jsonError(400, {
      code: "MISSING_URL",
      message: "Missing required \"url\" query parameter.",
    });
  }

  if (startTime === null) {
    return jsonError(400, {
      code: "INVALID_START_TIME",
      message: "\"time\" must be a non-negative number.",
      sourceUrl,
    });
  }

  let normalizedUrl = "";
  try {
    normalizedUrl = normalizeMediaUrl(sourceUrl).normalizedUrl;
  } catch (error: unknown) {
    if (error instanceof MediaValidationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        sourceUrl,
      });
    }
    return jsonError(400, {
      code: "INVALID_URL",
      message: "Invalid source URL.",
      sourceUrl,
    });
  }

  try {
    await assertMediaLikeSource(normalizedUrl, { signal: req.signal });
  } catch (error: unknown) {
    if (error instanceof MediaValidationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        sourceUrl,
        normalizedUrl,
      });
    }
    return jsonError(502, {
      code: "UPSTREAM_UNAVAILABLE",
      message: "Failed to validate upstream media source.",
      sourceUrl,
      normalizedUrl,
    });
  }

  if (activeTranscodes >= MAX_ACTIVE_TRANSCODES) {
    return jsonError(429, {
      code: "TRANSCODE_CAP_REACHED",
      message: "Too many active transcodes. Try again shortly.",
      sourceUrl,
      normalizedUrl,
      activeTranscodes,
      maxActiveTranscodes: MAX_ACTIVE_TRANSCODES,
    });
  }

  const requestId = randomUUID().slice(0, 8);
  const stream = new PassThrough();
  let ffmpegCommand: ffmpeg.FfmpegCommand | null = null;
  let cleanedUp = false;
  const upstreamReferer = buildUpstreamReferer(normalizedUrl);

  activeTranscodes += 1;
  logLine(
    `[${new Date().toISOString()}] [${requestId}] Accepted transcode. active=${activeTranscodes}\n`,
  );

  const cleanup = (reason: string, killProcess: boolean) => {
    if (cleanedUp) return;
    cleanedUp = true;

    req.signal.removeEventListener("abort", onAbort);

    if (killProcess && ffmpegCommand) {
      try {
        ffmpegCommand.kill("SIGKILL");
      } catch {
        // ignore kill race conditions
      }
    }

    if (!stream.destroyed && !stream.writableEnded) {
      stream.end();
    }

    activeTranscodes = Math.max(0, activeTranscodes - 1);
    logLine(
      `[${new Date().toISOString()}] [${requestId}] Cleanup: ${reason}. active=${activeTranscodes}\n`,
    );
  };

  const onAbort = () => cleanup("request aborted", true);
  req.signal.addEventListener("abort", onAbort, { once: true });
  stream.on("close", () => cleanup("output stream closed", true));
  stream.on("error", (streamError) => {
    cleanup(`output stream error: ${streamError.message}`, true);
  });

  try {
    const inputOptions = [
      "-ss",
      startTime,
      "-user_agent",
      DEFAULT_UPSTREAM_USER_AGENT,
      "-rw_timeout",
      "15000000",
      "-fflags",
      "+genpts+discardcorrupt",
      "-protocol_whitelist",
      "http,https,tcp,tls,crypto",
    ];

    if (upstreamReferer) {
      inputOptions.push("-referer", upstreamReferer);
    }

    const outputOptions = [
      "-c:v libx264",
      "-preset ultrafast",
      "-tune zerolatency",
      "-pix_fmt yuv420p",
      "-g 48",
      "-keyint_min 48",
      "-force_key_frames expr:gte(t,n_forced*2)",
      "-sc_threshold 0",
      // Audio mapping logic: Use global index if provided, else default to first audio stream
      ...(audioIndex ? ["-map 0:v:0", `-map 0:${audioIndex}`] : ["-map 0:v:0", "-map 0:a:0?"]),
      "-c:a aac",
      "-ac 2",
      "-f mp4",
      "-frag_duration 2000000",
      "-min_frag_duration 500000",
      "-movflags frag_keyframe+empty_moov+default_base_moof",
      "-max_muxing_queue_size 2048",
      "-avoid_negative_ts make_zero",
      "-reset_timestamps 1",
    ];

    // Subtitle Burning Logic
    if (subtitleIndex !== null) {
      // We use the subtitles filter to burn them in.
      // We explicitly wrap the URL in single quotes and escape internal single quotes.
      const escapedUrl = normalizedUrl.replace(/'/g, "'\\''");
      const filter = `subtitles='${escapedUrl}':si=${subtitleIndex}`;
      outputOptions.push("-vf", filter);
    }

    ffmpegCommand = ffmpeg(normalizedUrl)
      .inputOptions(inputOptions)
      .outputOptions(outputOptions)
      .on("start", (commandLine) => {
        logLine(
          `[${new Date().toISOString()}] [${requestId}] Spawned FFmpeg: ${redactSensitiveInfo(commandLine)}\n`,
        );
      })
      .on("stderr", (stderrLine) => {
        logLine(
          `[${new Date().toISOString()}] [${requestId}] [Stderr] ${redactSensitiveInfo(stderrLine)}\n`,
        );
      })
      .on("error", (err) => {
        logLine(
          `[${new Date().toISOString()}] [${requestId}] Transcoding error: ${err.message}\n`,
        );
        cleanup(`ffmpeg error: ${err.message}`, true);
      })
      .on("end", () => {
        logLine(`[${new Date().toISOString()}] [${requestId}] Transcoding finished\n`);
        cleanup("ffmpeg completed", false);
      });

    ffmpegCommand.pipe(stream, { end: true });
  } catch (error: unknown) {
    cleanup("failed to start ffmpeg command", true);
    return jsonError(500, {
      code: "TRANSCODE_START_FAILED",
      message: error instanceof Error ? error.message : "Unable to start FFmpeg.",
      sourceUrl,
      normalizedUrl,
      requestId,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", "video/mp4");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Transcode-Request-Id", requestId);

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers,
    status: 200,
  });
}
