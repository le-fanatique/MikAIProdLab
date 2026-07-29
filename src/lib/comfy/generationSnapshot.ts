// ---------------------------------------------------------------------------
// generationSnapshot.ts — Job payload snapshot (GEN.SEEDANCE.1)
//
// Captures, at queue time, everything needed to understand exactly what was
// sent to ComfyUI for a given generation_jobs row — even if the library
// workflow is edited or deleted later. Text/JSON only, never a binary file:
// only paths, names and metadata, plus the final queued workflow JSON
// itself (a small graph definition, not media).
//
// STYLE.1.E.CORE.1 — additive, backward-compatible: `styleProvenance` below
// extends this existing canonical provenance contract instead of creating a
// second one. It is entirely optional; legacy rows (and any row queued
// before Style integration) parse exactly as before via
// `parseGenerationSnapshot`. This ticket does not populate it from any real
// generation action — that rollout belongs to STYLE.1.E.SURFACES.1.
// ---------------------------------------------------------------------------

import type { GenerationStyleProvenance } from "@/lib/projectStyle/generationStyleSource";

export type GenerationSnapshot = {
  workflowId: number;
  /** STYLE.1.G.CORE.1 — "look-test" identifies a Look Development job; `contextId` is then the `look_tests.id`, never a Shot/Asset/Sequence id. */
  contextType: "shot" | "asset" | "sequence" | "look-test";
  contextId: number;
  createdAt: string;
  selections: {
    selectedImageByNodeId: Record<string, string>;
    scalarOverrideByNodeId: Record<string, string>;
    textOverrideByNodeId: Record<string, string>;
    /** Ordered — this order is what determined the Dynamic Batch clone order. */
    batchSelectedImageIds: string[];
  };
  dynamicBatch: {
    active: boolean;
    batchNodeId: string | null;
    templateChainNodeIds: string[];
    expandedNodeIds: string[];
    batchInputKeys: string[];
    selectedImageCount: number;
    clonedNodeCount: number;
  };
  promptText: string;
  /** True when the Advanced Payload Editor's edited JSON was used instead of the computed mapping. */
  overrideUsed: boolean;
  warnings: string[];
  uploadedImages: {
    nodeId: string;
    originalPath: string;
    comfyFilename: string;
    subfolder?: string;
    type?: string;
  }[];
  /** The exact JSON object passed to queueComfyPrompt — the ground truth for "what was actually queued". */
  queuedWorkflow: Record<string, unknown>;
  /**
   * SEQGEN.STORYBOARD.3 — only ever set for `contextType === "sequence"`:
   * the exact `@ImageN` <-> Asset/role mapping actually used to build
   * `promptText` and the queued images, in the same order as
   * `selections.batchSelectedImageIds` (or the full explicit selection when
   * this workflow has no Dynamic Batch node). Captured here, at queue time,
   * so a later draft-save reads real provenance from the immutable job
   * instead of the mutable current page state.
   */
  sequenceStoryboardReferenceMappings?: {
    refId: string;
    imageLabel: string;
    assetId: number;
    assetName: string;
    assetType: string;
    roleLabel: string | null;
  }[];
  /**
   * SEQGEN.VIDEO.1 — only ever set for a Sequence Video generation job: the
   * `sequence_storyboard_images.id` explicitly chosen as the mandatory
   * visual anchor (always @Image1). Captured here, at queue time, so
   * `saveSequenceVideoDraftFromJob` reads real provenance from the immutable
   * job instead of a client-supplied field.
   */
  sequenceVideoSourceStoryboardImageId?: number;
  /**
   * SEQGEN.VIDEO.1 — the full @ImageN <-> board/reference mapping actually
   * used, in payload order (index 0 is always the board, kind: "board").
   * Distinct from `sequenceStoryboardReferenceMappings` (image-workflow
   * casting-only) since entry 0 here is never a casting reference.
   */
  sequenceVideoImageMappings?: (
    | { refId: "board"; imageLabel: string; kind: "board" }
    | {
        refId: string;
        imageLabel: string;
        kind: "reference";
        assetId: number;
        assetName: string;
        assetType: string;
        roleLabel: string | null;
      }
  )[];
  /**
   * CAMLAB.POLISH.1 — only ever set for the Camera Lab's Gaussian-to-image
   * generation (Column 3): the real provenance of the two queued image
   * inputs. `sourcePlyJobId`/`sourceReferenceId` identify the upstream PLY
   * job and Shot reference image the snapshot was framed against;
   * `snapshotWidth/Height` are the captured snapshot's real pixel
   * dimensions; `inputMapping` records which node id received the
   * transient snapshot vs. the persisted source image, in queued order.
   * Never an API key or signed URL.
   */
  cameraLabProvenance?: {
    sourcePlyJobId: number;
    sourceReferenceId: number;
    snapshotWidth: number;
    snapshotHeight: number;
    inputMapping: {
      snapshotNodeId: string;
      sourceNodeId: string;
    };
    /** CAMLAB.POLISH.1 retake round 2 — whether input 1 was the PlayCanvas capture or an explicit local PNG upload replacing it. Never the file content, a local path, or a secret. */
    snapshotSource: "captured-snapshot" | "uploaded-override";
  };
  /**
   * STYLE.1.E.CORE.1 — the exact Project Style provenance used to compile
   * this job's prompt, present only when an effective, non-empty Style
   * existed for this consumer at queue time (never a draft id, secret,
   * binary or mutable client state — see
   * src/lib/projectStyle/generationStyleSource.ts). Absent for every
   * legacy job queued before Style integration, and for any job where no
   * effective Style existed or its compiled segment was empty.
   */
  styleProvenance?: GenerationStyleProvenance;
};

export function serializeGenerationSnapshot(snapshot: GenerationSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseGenerationSnapshot(raw: string | null): GenerationSnapshot | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as GenerationSnapshot;
  } catch {
    return null;
  }
}
