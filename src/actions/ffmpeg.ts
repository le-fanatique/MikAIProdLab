"use server";

// ---------------------------------------------------------------------------
// FFmpeg health check action (FFMPEG.BUNDLE.1)
// ---------------------------------------------------------------------------

import { checkFfmpegAvailability, type FfmpegAvailability } from "@/lib/ffmpeg";

/** Server action backing the "Check FFmpeg" button in Settings. Never throws — checkFfmpegAvailability already reduces every failure mode to a plain result object. */
export async function checkBundledFfmpeg(): Promise<FfmpegAvailability> {
  return checkFfmpegAvailability();
}
