import { describe, expect, it } from "vitest";
import { expandDynamicBatchWorkflow } from "@/lib/comfy/expandDynamicBatch";
import {
  expandDirectRepeatableInputsWorkflow,
  detectDirectRepeatableInput,
} from "@/lib/comfy/expandDirectRepeatableInputs";
import { isEmptySelectionError } from "@/lib/comfy/buildGenerationPayload";

// ---------------------------------------------------------------------------
// COMFY.EMPTYSEL.1, Part A — the net that must exist BEFORE Part B's fix.
//
// Calls the REAL expansion functions and the REAL predicate — never a
// reimplementation of either — so a false pass here can only mean the
// production code actually behaves this way.
//
// The third case is the one the ticket calls out as most important: a
// genuine detection failure must NOT be swallowed by the predicate. A
// predicate broad enough to recognize every failure as "empty selection"
// would make real breakage invisible to the author.
// ---------------------------------------------------------------------------

const dynamicBatchWorkflow = JSON.stringify({
  "13": {
    inputs: { inputcount: 2, image_1: ["28", 0] },
    class_type: "ImageBatchMulti",
    _meta: { title: "Make Image Batch (Dynamic Batch Input)" },
  },
  "28": {
    inputs: { image: "t.png" },
    class_type: "LoadImage",
    _meta: { title: "Load Image  (Repeatable)" },
  },
});

const directRepeatableWorkflow = JSON.stringify({
  "5": {
    class_type: "ByteDance2ReferenceNodeV2",
    inputs: { "model.reference_images.image_1": ["10", 0] },
    _meta: { title: "Seedance 2.5" },
  },
  "10": {
    class_type: "LoadImage",
    inputs: { image: "ref1.png" },
    _meta: { title: "Load Image  (Input) (Repeatable)" },
  },
});

// A genuine detection failure: two direct-repeatable-input candidates drawing
// from DIFFERENT upstream sources — refused, never grouped (COMFY.DIRECTPORTS.1b
// Correctif 2). Reused as-is from expandDirectRepeatableInputs.test.ts's own
// fixture for the same refusal.
const twoCompetingCandidatesWorkflow = JSON.stringify({
  "5": {
    class_type: "OpenAIGPTImageNodeV2",
    inputs: { "model.images.image_1": ["10", 0] },
    _meta: { title: "GPT Image 2" },
  },
  "10": {
    class_type: "LoadImage",
    inputs: { image: "ref1.png" },
    _meta: { title: "Load Image  (Input) (Repeatable)" },
  },
  "6": {
    class_type: "OpenAIGPTImageNodeV2",
    inputs: { "model.images.image_1": ["11", 0] },
    _meta: { title: "Second GPT Image 2" },
  },
  "11": {
    class_type: "LoadImage",
    inputs: { image: "ref2.png" },
    _meta: { title: "Load Image  (Input) (Repeatable)" },
  },
});

describe("COMFY.EMPTYSEL.1, Part A — empty-selection net", () => {
  it("Dynamic Batch mode, empty selection: the expansion returns ITS OWN empty-selection message, and the predicate recognizes it", () => {
    const result = expandDynamicBatchWorkflow({
      workflowJson: dynamicBatchWorkflow,
      selectedImages: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Add at least one image to Dynamic Image Batch before generating.");
    expect(isEmptySelectionError(result.error)).toBe(true);
  });

  it("Direct repeatable inputs mode, empty selection: the expansion returns ITS OWN (different) empty-selection message, and the predicate recognizes it", () => {
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: directRepeatableWorkflow,
      selectedImages: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "Add at least one image to the direct repeatable image inputs before generating."
    );
    expect(isEmptySelectionError(result.error)).toBe(true);
  });

  it("the two modes' empty-selection messages are not the same sentence (never merged into one literal)", () => {
    const dynamicBatchResult = expandDynamicBatchWorkflow({
      workflowJson: dynamicBatchWorkflow,
      selectedImages: [],
    });
    const directResult = expandDirectRepeatableInputsWorkflow({
      workflowJson: directRepeatableWorkflow,
      selectedImages: [],
    });

    expect(dynamicBatchResult.ok).toBe(false);
    expect(directResult.ok).toBe(false);
    if (dynamicBatchResult.ok || directResult.ok) return;
    expect(dynamicBatchResult.error).not.toBe(directResult.error);
  });

  it("MOST IMPORTANT: a real detection failure (two direct-repeatable candidates on different sources) is NOT recognized as an empty selection", () => {
    const detection = detectDirectRepeatableInput(twoCompetingCandidatesWorkflow);
    expect(detection.ok).toBe(false);
    if (detection.ok) return;
    expect(detection.error).toBeTruthy();
    expect(isEmptySelectionError(detection.error)).toBe(false);

    // Same real failure surfaces identically through the full expansion
    // path a generation panel actually calls.
    const expansion = expandDirectRepeatableInputsWorkflow({
      workflowJson: twoCompetingCandidatesWorkflow,
      selectedImages: [{ id: "a", imagePath: "a.png" }],
    });
    expect(expansion.ok).toBe(false);
    if (expansion.ok) return;
    expect(isEmptySelectionError(expansion.error)).toBe(false);
  });

  it("a real Dynamic Batch detection failure (two competing batch markers) is NOT recognized as an empty selection", () => {
    const twoBatchMarkers = JSON.stringify({
      "13": {
        inputs: { image_1: ["28", 0] },
        class_type: "ImageBatchMulti",
        _meta: { title: "Make Image Batch (Dynamic Batch Input)" },
      },
      "28": { inputs: { image: "t.png" }, class_type: "LoadImage", _meta: { title: "Load Image  (Repeatable)" } },
      "14": {
        inputs: { image_1: ["29", 0] },
        class_type: "ImageBatchMulti",
        _meta: { title: "Second Batch (Dynamic Batch Input)" },
      },
      "29": { inputs: { image: "t2.png" }, class_type: "LoadImage", _meta: { title: "Load Image  (Repeatable)" } },
    });

    const result = expandDynamicBatchWorkflow({
      workflowJson: twoBatchMarkers,
      selectedImages: [{ id: "a", imagePath: "a.png" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
    expect(isEmptySelectionError(result.error)).toBe(false);
  });

  it("isEmptySelectionError is false for null/undefined (no error at all)", () => {
    expect(isEmptySelectionError(null)).toBe(false);
    expect(isEmptySelectionError(undefined)).toBe(false);
  });
});
