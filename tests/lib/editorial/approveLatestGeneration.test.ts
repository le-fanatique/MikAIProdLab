import { describe, expect, it } from "vitest";
import { classifyLatestGenerationEligibility } from "@/lib/editorial/approveLatestGeneration";
import type { ResolvedShotSource } from "@/lib/editorial/videoSourceModeShared";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for approveLatestGeneration.ts's
// pure classifier.
// ---------------------------------------------------------------------------

function resolved(overrides: Partial<ResolvedShotSource> = {}): ResolvedShotSource {
  return { shotId: 1, videoPath: null, provenance: null, durationSeconds: null, ...overrides };
}

describe("classifyLatestGenerationEligibility", () => {
  it("classifies a usable shot-video source as eligible, carrying shotVideoId", () => {
    const resolvedMap = new Map<number, ResolvedShotSource>([
      [
        1,
        resolved({
          videoPath: "uploads/shot-videos/shot-1/a.mp4",
          provenance: { kind: "shot-video", shotVideoId: 99, source: "generation", createdAt: "x", generationJobId: 1, sourceCandidateId: null },
        }),
      ],
    ]);
    const result = classifyLatestGenerationEligibility([1], resolvedMap);
    expect(result.eligible).toEqual([{ shotId: 1, videoPath: "uploads/shot-videos/shot-1/a.mp4", shotVideoId: 99 }]);
    expect(result.skippedCount).toBe(0);
  });

  it("counts a shotId absent from the resolved map as skipped", () => {
    const result = classifyLatestGenerationEligibility([1, 2], new Map());
    expect(result.eligible).toEqual([]);
    expect(result.skippedCount).toBe(2);
  });

  it("counts a resolved entry with videoPath null as skipped", () => {
    const resolvedMap = new Map<number, ResolvedShotSource>([[1, resolved({ videoPath: null })]]);
    const result = classifyLatestGenerationEligibility([1], resolvedMap);
    expect(result.skippedCount).toBe(1);
  });

  it("counts a usable videoPath with 'approved' provenance (not 'shot-video') as skipped — a resolver contract violation, not trusted", () => {
    const resolvedMap = new Map<number, ResolvedShotSource>([
      [1, resolved({ videoPath: "uploads/x.mp4", provenance: { kind: "approved" } })],
    ]);
    const result = classifyLatestGenerationEligibility([1], resolvedMap);
    expect(result.eligible).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  it("preserves shotIds iteration order in the eligible list", () => {
    const resolvedMap = new Map<number, ResolvedShotSource>([
      [2, resolved({ videoPath: "uploads/2.mp4", provenance: { kind: "shot-video", shotVideoId: 2, source: "generation", createdAt: "x", generationJobId: 1, sourceCandidateId: null } })],
      [1, resolved({ videoPath: "uploads/1.mp4", provenance: { kind: "shot-video", shotVideoId: 1, source: "generation", createdAt: "x", generationJobId: 1, sourceCandidateId: null } })],
    ]);
    const result = classifyLatestGenerationEligibility([2, 1], resolvedMap);
    expect(result.eligible.map((e) => e.shotId)).toEqual([2, 1]);
  });
});
