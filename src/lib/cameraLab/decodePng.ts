// ---------------------------------------------------------------------------
// decodePng.ts — CAMLAB.POLISH.1
//
// Extracted from cameraLabSnapshot.ts's original private helper (CAMLAB.
// SHOTREF.1) so both the Shot-reference confirmation action and the
// Gaussian-to-image transient-upload action share one real-decode gate
// instead of two divergent copies. Behavior unchanged: a probed PNG header
// is not proof of a displayable image — the bundled FFmpeg must actually
// decode a frame from the written bytes.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFfmpegPath } from "@/lib/ffmpeg";

const execFileAsync = promisify(execFile);
const DECODE_TIMEOUT_MS = 30_000;

export async function isFullyDecodableImage(absolutePath: string): Promise<boolean> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return false;
  try {
    await execFileAsync(
      ffmpegPath,
      ["-v", "error", "-i", absolutePath, "-frames:v", "1", "-f", "null", "-"],
      { timeout: DECODE_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
    return true;
  } catch {
    return false;
  }
}
