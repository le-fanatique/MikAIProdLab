// ---------------------------------------------------------------------------
// generationSnapshot.ts — Job payload snapshot (GEN.SEEDANCE.1)
//
// Captures, at queue time, everything needed to understand exactly what was
// sent to ComfyUI for a given generation_jobs row — even if the library
// workflow is edited or deleted later. Text/JSON only, never a binary file:
// only paths, names and metadata, plus the final queued workflow JSON
// itself (a small graph definition, not media).
// ---------------------------------------------------------------------------

export type GenerationSnapshot = {
  workflowId: number;
  contextType: "shot" | "asset";
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
