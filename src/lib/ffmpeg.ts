// ---------------------------------------------------------------------------
// Bundled FFmpeg/FFprobe helper (FFMPEG.BUNDLE.1)
//
// Server-only. Wraps the ffmpeg/ffprobe binaries bundled via the
// "ffmpeg-ffprobe-static" npm dependency (pinned to 6.1.1 — see
// docs/FFMPEG_BUNDLE_1_BUNDLED_FFMPEG_HEALTHCHECK.md for why that package
// and that exact version were chosen over the system-FFmpeg / two-package
// alternatives). No system FFmpeg install is required in dev or in
// production — the binary ships inside node_modules for the platform the
// server is running on (Windows in this dev environment, Linux on the
// target server).
//
// NEVER import this module from a Client Component or any code that could
// end up in a browser bundle — child_process/binary paths are meaningless
// (and a potential info leak) outside a Node server context. Every export
// here assumes a Node.js server runtime (Next.js server actions / route
// handlers), never the Edge runtime.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegPath as bundledFfmpegPath, ffprobePath as bundledFfprobePath } from "ffmpeg-ffprobe-static";

const execFileAsync = promisify(execFile);

/** Absolute path to the bundled ffmpeg binary for this platform, or null if unsupported (see ffmpeg-ffprobe-static's own platform/arch matrix). */
export function getFfmpegPath(): string | null {
  return bundledFfmpegPath;
}

/** Absolute path to the bundled ffprobe binary for this platform, or null if unsupported. */
export function getFfprobePath(): string | null {
  return bundledFfprobePath;
}

const VERSION_CHECK_TIMEOUT_MS = 8_000;

/** First line of `<bin> -version` output, e.g. "ffmpeg version 6.1.1-essentials_build-www.gyan.dev ...". Returns null if the binary can't be run at all. */
async function getBinaryVersionLine(binaryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ["-version"], {
      timeout: VERSION_CHECK_TIMEOUT_MS,
      windowsHide: true,
    });
    return stdout.split(/\r?\n/, 1)[0]?.trim() || null;
  } catch {
    return null;
  }
}

export type FfmpegAvailability = {
  ok: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  error?: string;
};

/**
 * Confirms the bundled ffmpeg/ffprobe binaries exist for this platform and
 * actually run (`-version`), and reports their version strings. Never
 * throws — any failure is reflected in the returned `ok`/`error` fields,
 * since this is meant to back a user-facing health check, not to abort a
 * request.
 */
export async function checkFfmpegAvailability(): Promise<FfmpegAvailability> {
  const ffmpegPath = getFfmpegPath();
  const ffprobePath = getFfprobePath();

  if (!ffmpegPath || !ffprobePath) {
    return {
      ok: false,
      ffmpegPath,
      ffprobePath,
      error: "FFmpeg/FFprobe binaries are not available for this platform/architecture.",
    };
  }

  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    getBinaryVersionLine(ffmpegPath),
    getBinaryVersionLine(ffprobePath),
  ]);

  if (!ffmpegVersion || !ffprobeVersion) {
    return {
      ok: false,
      ffmpegPath,
      ffprobePath,
      ffmpegVersion: ffmpegVersion ?? undefined,
      ffprobeVersion: ffprobeVersion ?? undefined,
      error: "FFmpeg/FFprobe binaries exist but could not be executed. Check file permissions.",
    };
  }

  return {
    ok: true,
    ffmpegPath,
    ffprobePath,
    ffmpegVersion,
    ffprobeVersion,
  };
}

const FFPROBE_TIMEOUT_MS = 15_000;

/**
 * Runs `ffprobe -v error -print_format json -show_format -show_streams
 * <inputPath>` and returns the parsed JSON. `inputPath` is passed as a
 * single execFile argument (never shell-interpolated), so it is never
 * vulnerable to shell injection regardless of its content — but callers
 * must still only ever pass a path MikAI itself resolved (e.g. from a
 * validated uploads-relative path), never raw user input, since a
 * malicious *path* could still point ffprobe at an unintended file.
 */
export async function runFfprobeJson(inputPath: string): Promise<unknown> {
  const ffprobePath = getFfprobePath();
  if (!ffprobePath) {
    throw new Error("FFprobe binary is not available for this platform/architecture.");
  }

  const { stdout } = await execFileAsync(
    ffprobePath,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath],
    { timeout: FFPROBE_TIMEOUT_MS, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
  );

  return JSON.parse(stdout);
}
