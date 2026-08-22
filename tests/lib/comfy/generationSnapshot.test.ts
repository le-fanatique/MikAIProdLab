import { describe, it, expect } from "vitest";
import {
  parseGenerationSnapshot,
  serializeGenerationSnapshot,
  type GenerationSnapshot,
} from "@/lib/comfy/generationSnapshot";

// A minimal, legacy-shaped snapshot — exactly what every job queued before
// SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1 (and, further back, before every
// other optional field this contract has grown) still persists.
const LEGACY_SNAPSHOT: GenerationSnapshot = {
  workflowId: 1,
  contextType: "sequence",
  contextId: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  selections: {
    selectedImageByNodeId: {},
    scalarOverrideByNodeId: {},
    textOverrideByNodeId: {},
    batchSelectedImageIds: [],
  },
  dynamicBatch: {
    active: false,
    batchNodeId: null,
    templateChainNodeIds: [],
    expandedNodeIds: [],
    batchInputKeys: [],
    selectedImageCount: 0,
    clonedNodeCount: 0,
  },
  overrideUsed: false,
  warnings: [],
  uploadedImages: [],
  queuedWorkflow: {},
};

describe("parseGenerationSnapshot — SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1", () => {
  it("reads a legacy snapshot with no sequenceStoryboardShotRange field without error, and the field stays undefined", () => {
    const raw = serializeGenerationSnapshot(LEGACY_SNAPSHOT);
    const parsed = parseGenerationSnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.sequenceStoryboardShotRange).toBeUndefined();
    // Every other field survives the round trip untouched.
    expect(parsed!.workflowId).toBe(1);
    expect(parsed!.contextType).toBe("sequence");
  });

  it("round-trips a snapshot that DOES carry sequenceStoryboardShotRange", () => {
    const withRange: GenerationSnapshot = {
      ...LEGACY_SNAPSHOT,
      sequenceStoryboardShotRange: { fromShotId: 200, toShotId: 400, shotIdsInOrder: [200, 300, 400] },
    };
    const raw = serializeGenerationSnapshot(withRange);
    const parsed = parseGenerationSnapshot(raw);
    expect(parsed!.sequenceStoryboardShotRange).toEqual({
      fromShotId: 200,
      toShotId: 400,
      shotIdsInOrder: [200, 300, 400],
    });
  });

  it("still returns null for unparsable JSON, unrelated to this field", () => {
    expect(parseGenerationSnapshot("{not json")).toBeNull();
    expect(parseGenerationSnapshot(null)).toBeNull();
  });
});
