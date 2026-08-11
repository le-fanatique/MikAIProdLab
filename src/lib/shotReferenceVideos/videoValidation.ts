// ---------------------------------------------------------------------------
// videoValidation.ts — SHOT.VIDEO.REFERENCES.1
//
// Pure: no I/O. Magic-byte checks for the three accepted Video Reference
// container types, mirroring `imageValidation.ts`'s `hasPngSignature` idiom
// — a fast, dependency-free rejection of anything that isn't even the
// claimed container, independent of what the uploaded filename/extension or
// browser-supplied MIME type claims.
// ---------------------------------------------------------------------------

export const MAX_REFERENCE_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

export const ALLOWED_REFERENCE_VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);

// MP4 and MOV are both ISO Base Media File Format containers: a 4-byte box
// size followed by the ASCII box type "ftyp" at byte offset 4. This does not
// by itself distinguish MP4 from MOV (both legitimately use "ftyp"); the
// extension picks which of the two the caller is claiming, and FFprobe's own
// stream inspection (server-only, see mediaPublish.ts) is the actual content
// authority — this check exists only to reject something that is neither.
const ISO_BMFF_BOX_TYPE_OFFSET = 4;
const ISO_BMFF_BOX_TYPE = "ftyp";

// WebM (and Matroska) files start with the EBML header magic number.
const WEBM_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

export function hasIsoBmffSignature(buf: Buffer): boolean {
  if (buf.length < ISO_BMFF_BOX_TYPE_OFFSET + ISO_BMFF_BOX_TYPE.length) return false;
  return buf.subarray(ISO_BMFF_BOX_TYPE_OFFSET, ISO_BMFF_BOX_TYPE_OFFSET + ISO_BMFF_BOX_TYPE.length).toString("ascii") === ISO_BMFF_BOX_TYPE;
}

export function hasWebmSignature(buf: Buffer): boolean {
  if (buf.length < WEBM_SIGNATURE.length) return false;
  return buf.subarray(0, WEBM_SIGNATURE.length).equals(WEBM_SIGNATURE);
}

/** Whether `buf`'s real magic bytes match what `ext` (already lowercased, with leading dot) claims to be — never trusts the extension/MIME alone. */
export function hasAllowedReferenceVideoSignature(buf: Buffer, ext: string): boolean {
  if (ext === ".webm") return hasWebmSignature(buf);
  if (ext === ".mp4" || ext === ".mov") return hasIsoBmffSignature(buf);
  return false;
}

export type ProbedVideoDimensions = { width: number; height: number };

/** Never accepts a `0×0`, negative, `NaN`, or missing dimension a corrupt/truncated probe can report. */
export function hasValidVideoDimensions(dimensions: ProbedVideoDimensions | null | undefined): dimensions is ProbedVideoDimensions {
  return !!dimensions && Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height) && dimensions.width > 0 && dimensions.height > 0;
}

/** General media-validity gate for any published Video Reference / Shot Videos file: a real, finite, strictly-positive duration. No upper bound — that is a SEPARATE, narrower eligibility rule (see `isEligibleShotTargetDuration`) for one specific downstream decision, not a general acceptance gate. */
export function hasPositiveFiniteDuration(durationSeconds: number | null | undefined): durationSeconds is number {
  return typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0;
}

/** SHOT.VIDEO.REFERENCES.1 — the "Update Shot target duration" checkbox on the "Add to Shot Videos" bridge may only be offered when the probed duration is finite, `> 0`, and `<= 600`s. This is deliberately NOT the general Video Reference acceptance gate (`hasPositiveFiniteDuration`) — a longer reference video is still a perfectly valid reference, it just cannot drive the Shot's target duration. */
export function isEligibleShotTargetDuration(durationSeconds: number | null | undefined): durationSeconds is number {
  return hasPositiveFiniteDuration(durationSeconds) && durationSeconds <= 600;
}
