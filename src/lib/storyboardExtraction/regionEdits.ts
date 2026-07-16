// ---------------------------------------------------------------------------
// storyboardExtraction/regionEdits.ts — SEQGEN.STORYBOARD.EXTRACT.1-FIX4
//
// Pure parsing/validation of the "Update All" bulk-edit payload
// (client-collected regionsJson). No DB/filesystem access — fully
// unit-testable. Every entry must be valid before the caller writes
// anything: resizeAllExtractionRegions in src/actions/storyboardExtraction.ts
// validates the full parsed list against live extraction/region state
// BEFORE opening its write transaction, so a single bad entry (here or at
// that later stage) aborts the whole batch, never partially applies.
// ---------------------------------------------------------------------------

export class RegionEditsError extends Error {}

export type RegionEdit = { regionId: number; x: number; y: number; width: number; height: number };

type RawRegionEdit = { regionId?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown };

/** Parses+bounds-checks a JSON-encoded array of region edits. Throws RegionEditsError with a message safe to surface to the user on the first invalid entry — never silently drops or clamps a bad value. */
export function parseRegionEdits(raw: string): RegionEdit[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegionEditsError("Invalid region data.");
  }
  if (!Array.isArray(parsed)) {
    throw new RegionEditsError("Invalid region data.");
  }
  return parsed.map((entry, i) => {
    const r = entry as RawRegionEdit;
    const regionId = Number(r.regionId);
    const x = Number(r.x);
    const y = Number(r.y);
    const width = Number(r.width);
    const height = Number(r.height);
    if (!Number.isInteger(regionId) || regionId <= 0) {
      throw new RegionEditsError(`Region ${i + 1}: invalid region id.`);
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RegionEditsError(`Region ${i + 1}: x/y/width/height must be whole numbers.`);
    }
    if (width <= 0 || height <= 0 || x < 0 || y < 0) {
      throw new RegionEditsError(`Region ${i + 1}: dimensions must be positive.`);
    }
    return { regionId, x, y, width, height };
  });
}
