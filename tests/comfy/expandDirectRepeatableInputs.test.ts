import { describe, expect, it } from "vitest";
import {
  detectDirectRepeatableInput,
  expandDirectRepeatableInputsWorkflow,
} from "@/lib/comfy/expandDirectRepeatableInputs";

// ---------------------------------------------------------------------------
// COMFY.DIRECTPORTS.1, Part A — the characterization net.
//
// `expandDirectRepeatableInputs.ts` had no test at all before this file:
// grepping "model.images.image_" across `tests/` found nothing. This pins the
// current OpenAI GPT Image 2 behavior (`OpenAIGPTImageNodeV2` +
// `model.images.image_N`) exactly as it stands today, before Part B touches
// detection. Every assertion here must still pass, unchanged, after Part B.
// ---------------------------------------------------------------------------

const openAiWorkflow = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    "5": {
      class_type: "OpenAIGPTImageNodeV2",
      inputs: {
        "model.images.image_1": ["10", 0],
        prompt: "a portrait",
      },
      _meta: { title: "GPT Image 2" },
    },
    "10": {
      class_type: "LoadImage",
      inputs: { image: "ref1.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    ...extra,
  });

const openAiWorkflowThreePorts = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    "5": {
      class_type: "OpenAIGPTImageNodeV2",
      inputs: {
        "model.images.image_1": ["10", 0],
        "model.images.image_2": ["11", 0],
        "model.images.image_3": ["12", 0],
        prompt: "a portrait",
      },
      _meta: { title: "GPT Image 2" },
    },
    "10": {
      class_type: "LoadImage",
      inputs: { image: "ref1.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    "11": {
      class_type: "LoadImage",
      inputs: { image: "ref2.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    "12": {
      class_type: "LoadImage",
      inputs: { image: "ref3.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    ...extra,
  });

describe("detectDirectRepeatableInput — OpenAI GPT Image 2 (characterization)", () => {
  it("detects the node and returns populated ports sorted by ascending index", () => {
    const result = detectDirectRepeatableInput(openAiWorkflowThreePorts());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.targetNodeId).toBe("5");
    expect(result.info.targetClassType).toBe("OpenAIGPTImageNodeV2");
    expect(result.info.populatedPorts.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(result.info.populatedPorts.map((p) => p.key)).toEqual([
      "model.images.image_1",
      "model.images.image_2",
      "model.images.image_3",
    ]);
  });

  it("COMFY.DIRECTPORTS.1b, Correctif 1: a node with an unconnected port is excluded, not an error", () => {
    // NOTE: this assertion is intentionally NOT pinned to a named per-port
    // error anymore. Ticket COMFY.DIRECTPORTS.1b §13 explicitly retires
    // this exact diagnostic: once the class_type gate is gone, "this node
    // carries our ports" no longer safely implies "this node is ours", so a
    // malformed port simply excludes the node from candidacy — it is not
    // surfaced as an error. A deliberate, ticket-specified behavior change,
    // not an accidental regression (see the two "names the ... port"
    // assertions this replaces, from the first pass).
    const workflow = JSON.stringify({
      "5": {
        class_type: "OpenAIGPTImageNodeV2",
        inputs: {
          "model.images.image_1": ["10", 0],
          "model.images.image_2": "not-connected",
        },
        _meta: { title: "GPT Image 2" },
      },
      "10": {
        class_type: "LoadImage",
        inputs: { image: "ref1.png" },
        _meta: { title: "Load Image  (Input) (Repeatable)" },
      },
    });

    const result = detectDirectRepeatableInput(workflow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeNull();
  });

  it("COMFY.DIRECTPORTS.1b, Correctif 1: a node with a port fed by a non-image-source node is excluded, not an error", () => {
    const workflow = JSON.stringify({
      "5": {
        class_type: "OpenAIGPTImageNodeV2",
        inputs: {
          "model.images.image_1": ["10", 0],
          "model.images.image_2": ["99", 0],
        },
        _meta: { title: "GPT Image 2" },
      },
      "10": {
        class_type: "LoadImage",
        inputs: { image: "ref1.png" },
        _meta: { title: "Load Image  (Input) (Repeatable)" },
      },
      "99": {
        class_type: "SomeOtherNode",
        inputs: {},
        _meta: { title: "Not An Image Source" },
      },
    });

    const result = detectDirectRepeatableInput(workflow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeNull();
  });

  it("COMFY.DIRECTPORTS.1b, §13 filet: the author's #54 case (LoadImage -> Resize Image v2 -> image_1) is `none`, exactly as before the ticket", () => {
    const workflow = JSON.stringify({
      "5": {
        class_type: "OpenAIGPTImageNodeV2",
        inputs: { "model.images.image_1": ["11", 0] },
        _meta: { title: "GPT Image 2" },
      },
      "11": {
        class_type: "Resize Image v2",
        inputs: { image: ["10", 0] },
        _meta: { title: "Resize Image v2" },
      },
      "10": {
        class_type: "LoadImage",
        inputs: { image: "ref1.png" },
        _meta: { title: "Load Image" },
      },
    });

    const result = detectDirectRepeatableInput(workflow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeNull();
  });

  it("refuses two candidates only when they draw from DIFFERENT upstream sources (COMFY.DIRECTPORTS.1b, Correctif 2)", () => {
    // Two candidates sharing the SAME source are now a group (Correctif 2,
    // tested separately below) — a genuine refusal needs genuinely
    // different sources.
    const workflow = openAiWorkflow({
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

    const result = detectDirectRepeatableInput(workflow);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("two candidates sharing the SAME upstream source form a group, not a refusal (COMFY.DIRECTPORTS.1b, Correctif 2)", () => {
    const workflow = openAiWorkflow({
      "6": {
        class_type: "OpenAIGPTImageNodeV2",
        inputs: { "model.images.image_1": ["10", 0] },
        _meta: { title: "Second GPT Image 2" },
      },
    });

    const result = detectDirectRepeatableInput(workflow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.groupNodes.map((n) => n.nodeId)).toEqual(["5", "6"]);
    expect(result.info.targetNodeId).toBe("5");
  });

  it("returns `ok:false, error:null` — not an error — for a workflow with no matching node", () => {
    const plain = JSON.stringify({
      "1": { class_type: "LoadImage", inputs: { image: "a.png" }, _meta: { title: "Load Image" } },
    });

    const result = detectDirectRepeatableInput(plain);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeNull();
  });
});

describe("expandDirectRepeatableInputsWorkflow — OpenAI GPT Image 2 (characterization)", () => {
  it("expands a single-port workflow to 3 selected images: 3 contiguous ports, 3 cloned chains", () => {
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: openAiWorkflow(),
      selectedImages: [
        { id: "a", imagePath: "a.png" },
        { id: "b", imagePath: "b.png" },
        { id: "c", imagePath: "c.png" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batchInputKeys).toEqual([
      "model.images.image_1",
      "model.images.image_2",
      "model.images.image_3",
    ]);
    expect(result.expandedNodeIds.length).toBe(3);
    expect(result.preview.clonedNodeCount).toBe(3);
    expect(result.preview.selectedImageCount).toBe(3);

    const expanded = JSON.parse(result.workflowJson) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
    const target = expanded["5"];
    expect(target.inputs?.["model.images.image_1"]).toBeDefined();
    expect(target.inputs?.["model.images.image_2"]).toBeDefined();
    expect(target.inputs?.["model.images.image_3"]).toBeDefined();
  });

  it("a reduced selection leaves no stale port from the wider original set", () => {
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: openAiWorkflowThreePorts(),
      selectedImages: [{ id: "a", imagePath: "a.png" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batchInputKeys).toEqual(["model.images.image_1"]);

    const expanded = JSON.parse(result.workflowJson) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
    const target = expanded["5"];
    expect(target.inputs?.["model.images.image_1"]).toBeDefined();
    expect(target.inputs?.["model.images.image_2"]).toBeUndefined();
    expect(target.inputs?.["model.images.image_3"]).toBeUndefined();
  });

  it("passes through unchanged (`ok:true`, no expansion) when no matching node exists", () => {
    const plain = JSON.stringify({
      "1": { class_type: "LoadImage", inputs: { image: "a.png" }, _meta: { title: "Load Image" } },
    });

    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: plain,
      selectedImages: [{ id: "a", imagePath: "a.png" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workflowJson).toBe(plain);
    expect(result.expandedNodeIds).toEqual([]);
  });

  it("errors when no image is selected", () => {
    // NOTE: the exact wording is intentionally NOT pinned here. Ticket
    // COMFY.DIRECTPORTS.1 §7 explicitly requires rewording this message
    // (it hard-codes "GPT Image 2", naming OpenAI in a now-generic path) —
    // a deliberate, ticket-specified text change, not an accidental
    // regression. Only the refusal itself is characterized.
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: openAiWorkflow(),
      selectedImages: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// COMFY.DIRECTPORTS.1, Part B — detection generalized to any node carrying
// `image_N`-suffixed ports (§6, §10).
// ---------------------------------------------------------------------------

const byteDanceWorkflow = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    "5": {
      class_type: "ByteDance2ReferenceNodeV2",
      inputs: {
        "model.reference_images.image_1": ["10", 0],
        "model.reference_images.image_2": ["11", 0],
        "model.reference_images.image_3": ["12", 0],
        prompt: "a shot",
      },
      _meta: { title: "Seedance 2.5" },
    },
    "10": {
      class_type: "LoadImage",
      inputs: { image: "ref1.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    "11": {
      class_type: "LoadImage",
      inputs: { image: "ref2.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    "12": {
      class_type: "LoadImage",
      inputs: { image: "ref3.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    ...extra,
  });

describe("detectDirectRepeatableInput — the author's ByteDance case (Part B)", () => {
  it("detects a non-OpenAI, non-suffix-named node purely from its `image_N` ports", () => {
    const result = detectDirectRepeatableInput(byteDanceWorkflow());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.targetNodeId).toBe("5");
    expect(result.info.targetClassType).toBe("ByteDance2ReferenceNodeV2");
    expect(result.info.populatedPorts.map((p) => p.key)).toEqual([
      "model.reference_images.image_1",
      "model.reference_images.image_2",
      "model.reference_images.image_3",
    ]);
  });

  it("detects the same node with a single populated port — one port suffices", () => {
    const singlePort = JSON.stringify({
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

    const result = detectDirectRepeatableInput(singlePort);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.populatedPorts.map((p) => p.key)).toEqual([
      "model.reference_images.image_1",
    ]);
  });

  it("ignores video_N, audio_N and asset_N ports on the same node — the mandatory `image_` anchor", () => {
    const withOtherModalityPorts = byteDanceWorkflow({
      "5": {
        class_type: "ByteDance2ReferenceNodeV2",
        inputs: {
          "model.reference_images.image_1": ["10", 0],
          "model.reference_videos.video_1": ["20", 0],
          "model.reference_audio.audio_1": ["21", 0],
          "model.reference_assets.asset_1": ["22", 0],
          prompt: "a shot",
        },
        _meta: { title: "Seedance 2.5" },
      },
      "20": { class_type: "LoadVideo", inputs: { video: "v.mp4" }, _meta: { title: "Load Video" } },
      "21": { class_type: "LoadAudio", inputs: { audio: "a.wav" }, _meta: { title: "Load Audio" } },
      "22": { class_type: "LoadAsset", inputs: { asset: "a.bin" }, _meta: { title: "Load Asset" } },
    });

    const result = detectDirectRepeatableInput(withOtherModalityPorts);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the image_N port is picked up; video/audio/asset ports never
    // become candidates and are never wired to an image selection.
    expect(result.info.populatedPorts.map((p) => p.key)).toEqual([
      "model.reference_images.image_1",
    ]);
  });

  it("names both nodes when two candidates exist on DIFFERENT upstream sources (COMFY.DIRECTPORTS.1b, Correctif 2)", () => {
    const two = byteDanceWorkflow({
      "6": {
        class_type: "ByteDance2ReferenceNodeV2",
        inputs: { "model.reference_images.image_1": ["20", 0] },
        _meta: { title: "Duplicate Node" },
      },
      "20": {
        class_type: "LoadImage",
        inputs: { image: "other.png" },
        _meta: { title: "Load Image  (Input) (Repeatable)" },
      },
    });

    const result = detectDirectRepeatableInput(two);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Seedance 2.5");
    expect(result.error).toContain("5");
    expect(result.error).toContain("Duplicate Node");
    expect(result.error).toContain("6");
  });

  it("expands the author's 3-port workflow to 4 selected images: 4 contiguous ports, 4 Load Image nodes", () => {
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: byteDanceWorkflow(),
      selectedImages: [
        { id: "a", imagePath: "a.png" },
        { id: "b", imagePath: "b.png" },
        { id: "c", imagePath: "c.png" },
        { id: "d", imagePath: "d.png" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batchInputKeys).toEqual([
      "model.reference_images.image_1",
      "model.reference_images.image_2",
      "model.reference_images.image_3",
      "model.reference_images.image_4",
    ]);
    expect(result.expandedNodeIds.length).toBe(4);
    expect(result.preview.clonedNodeCount).toBe(4);
  });
});

describe("resolveImageExpansionMode / detectDynamicBatchUiInfo — priority is unchanged (Part B)", () => {
  it("a workflow with BOTH a Dynamic Batch node and `.image_N` ports stays `dynamic-batch`", async () => {
    const { detectDynamicBatchUiInfo } = await import("@/lib/comfy/buildGenerationPayload");

    const both = JSON.stringify({
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

    const info = detectDynamicBatchUiInfo(both);

    expect(info.kind).toBe("ready");
    if (info.kind !== "ready") return;
    expect(info.mode).toBe("dynamic-batch");
    expect(info.batchNodeId).toBe("13");
  });
});

// ---------------------------------------------------------------------------
// COMFY.DIRECTPORTS.1b, Correctif 2 — the author's #56 case: a single
// LoadImage feeding the SAME-indexed port on two nodes at once is a group,
// not an ambiguity. Diagram from the ticket (§14):
//
//   LoadImage(1) ──┬──> Gemini(7) ──> GPT Image 2(9) ──> SaveImage
//                  └──────────────────┘
// ---------------------------------------------------------------------------

const sharedSourceGroupWorkflow = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    "1": {
      class_type: "LoadImage",
      inputs: { image: "shared-ref.png" },
      _meta: { title: "Load Image  (Input) (Repeatable)" },
    },
    "7": {
      class_type: "GeminiNodeV2",
      inputs: { "model.images.image_1": ["1", 0] },
      _meta: { title: "Google Gemini" },
    },
    "9": {
      class_type: "OpenAIGPTImageNodeV2",
      inputs: { "model.images.image_1": ["1", 0] },
      _meta: { title: "GPT Image 2" },
    },
    ...extra,
  });

describe("detectDirectRepeatableInput / expandDirectRepeatableInputsWorkflow — the author's #56 group case", () => {
  it("detects the group, targeting the lower node id as the stable key", () => {
    const result = detectDirectRepeatableInput(sharedSourceGroupWorkflow());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.targetNodeId).toBe("7");
    expect(result.info.groupNodes.map((n) => n.nodeId)).toEqual(["7", "9"]);
  });

  it("a 3-image selection writes image_1..image_3 on BOTH nodes, with 3 cloned chains, not 6", () => {
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: sharedSourceGroupWorkflow(),
      selectedImages: [
        { id: "a", imagePath: "a.png" },
        { id: "b", imagePath: "b.png" },
        { id: "c", imagePath: "c.png" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.clonedNodeCount).toBe(3);
    expect(result.expandedNodeIds.length).toBe(3);

    const expanded = JSON.parse(result.workflowJson) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
    for (const nodeId of ["7", "9"]) {
      const inputs = expanded[nodeId].inputs ?? {};
      expect(inputs["model.images.image_1"]).toBeDefined();
      expect(inputs["model.images.image_2"]).toBeDefined();
      expect(inputs["model.images.image_3"]).toBeDefined();
    }
  });

  it("each clone of rank i is wired onto BOTH nodes' port of rank i (same clone, not two)", () => {
    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: sharedSourceGroupWorkflow(),
      selectedImages: [
        { id: "a", imagePath: "a.png" },
        { id: "b", imagePath: "b.png" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expanded = JSON.parse(result.workflowJson) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
    const port1On7 = expanded["7"].inputs?.["model.images.image_1"];
    const port1On9 = expanded["9"].inputs?.["model.images.image_1"];
    // Same clone id feeds both nodes' rank-1 port — a single reference set,
    // not one clone per target node.
    expect(port1On7).toEqual(port1On9);
  });

  it("group members with DIFFERENT port prefixes each get their own correctly-named port", () => {
    const mixedPrefixes = JSON.stringify({
      "1": {
        class_type: "LoadImage",
        inputs: { image: "shared-ref.png" },
        _meta: { title: "Load Image  (Input) (Repeatable)" },
      },
      "7": {
        class_type: "GeminiNodeV2",
        inputs: { "model.images.image_1": ["1", 0] },
        _meta: { title: "Google Gemini" },
      },
      "9": {
        class_type: "ByteDance2ReferenceNodeV2",
        inputs: { "model.reference_images.image_1": ["1", 0] },
        _meta: { title: "Seedance 2.5" },
      },
    });

    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: mixedPrefixes,
      selectedImages: [
        { id: "a", imagePath: "a.png" },
        { id: "b", imagePath: "b.png" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expanded = JSON.parse(result.workflowJson) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
    expect(expanded["7"].inputs?.["model.images.image_1"]).toBeDefined();
    expect(expanded["7"].inputs?.["model.images.image_2"]).toBeDefined();
    expect(expanded["9"].inputs?.["model.reference_images.image_1"]).toBeDefined();
    expect(expanded["9"].inputs?.["model.reference_images.image_2"]).toBeDefined();
  });

  it("reducing the selection leaves no stale port on EITHER node in the group", () => {
    const threeImageWorkflow = JSON.stringify({
      "1": {
        class_type: "LoadImage",
        inputs: { image: "shared-ref.png" },
        _meta: { title: "Load Image  (Input) (Repeatable)" },
      },
      "7": {
        class_type: "GeminiNodeV2",
        inputs: {
          "model.images.image_1": ["1", 0],
          "model.images.image_2": ["1", 0],
          "model.images.image_3": ["1", 0],
        },
        _meta: { title: "Google Gemini" },
      },
      "9": {
        class_type: "OpenAIGPTImageNodeV2",
        inputs: {
          "model.images.image_1": ["1", 0],
          "model.images.image_2": ["1", 0],
          "model.images.image_3": ["1", 0],
        },
        _meta: { title: "GPT Image 2" },
      },
    });

    const result = expandDirectRepeatableInputsWorkflow({
      workflowJson: threeImageWorkflow,
      selectedImages: [{ id: "a", imagePath: "a.png" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expanded = JSON.parse(result.workflowJson) as Record<
      string,
      { inputs?: Record<string, unknown> }
    >;
    for (const nodeId of ["7", "9"]) {
      const inputs = expanded[nodeId].inputs ?? {};
      expect(inputs["model.images.image_1"]).toBeDefined();
      expect(inputs["model.images.image_2"]).toBeUndefined();
      expect(inputs["model.images.image_3"]).toBeUndefined();
    }
  });
});
