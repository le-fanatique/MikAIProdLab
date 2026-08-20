import { describe, expect, it } from "vitest";
import { expandDynamicBatchWorkflow } from "@/lib/comfy/expandDynamicBatch";

// ---------------------------------------------------------------------------
// The `inputcount` bug, reported from real use.
//
// `ImageBatchMulti` exposes a fixed number of `image_N` slots governed by an
// `inputcount` widget: in the editor you set the number, press "Update
// inputs", and only then can you connect that many. **At run time the node
// reads only the first `inputcount` slots.**
//
// The expander wired `image_1..image_N` but never wrote `inputcount`, so it
// kept its serialized default of 2. Every job queued with three or more
// references had the extra images present in the JSON and ignored by ComfyUI.
// Nothing errored — the generation simply never saw them, which is why it
// survived until someone compared two exported workflows.
//
// The fixture below is the shape of the author's own Seedance workflow,
// reduced to what this behaviour depends on.
// ---------------------------------------------------------------------------

function workflowWithBatch(inputcount: number) {
  return {
    "13": {
      inputs: {
        inputcount,
        "Update inputs": null,
        image_1: ["28", 0],
      },
      class_type: "ImageBatchMulti",
      _meta: { title: "Make Image Batch (Dynamic Batch Input)" },
    },
    "23": {
      inputs: { "model.reference_images.image_1": ["13", 0] },
      class_type: "ByteDance2ReferenceNode",
      _meta: { title: "ByteDance Seedance 2.0 Reference to Video" },
    },
    "28": {
      inputs: { image: "template.png" },
      class_type: "LoadImage",
      _meta: { title: "Load Image  (Repeatable)" },
    },
  };
}

const images = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i + 1), imagePath: `image-${i + 1}.png` }));

function expand(count: number, declared = 2) {
  return expandDynamicBatchWorkflow({
    workflowJson: JSON.stringify(workflowWithBatch(declared)),
    selectedImages: images(count),
  });
}

function batchInputs(result: { ok: true; workflowJson: string }) {
  return (JSON.parse(result.workflowJson) as Record<string, { inputs: Record<string, unknown> }>)["13"]
    .inputs;
}

describe("dynamic batch expansion — inputcount follows the images", () => {
  it("declares five inputs when five images are selected", () => {
    const result = expand(5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const inputs = batchInputs(result);
    // The bug: this used to stay 2, and ComfyUI ignored images 3 to 5.
    expect(inputs.inputcount).toBe(5);
    for (let i = 1; i <= 5; i++) {
      expect(inputs[`image_${i}`]).toBeDefined();
    }
  });

  it("keeps inputcount and the wired slots in agreement, whatever the count", () => {
    for (const count of [1, 2, 3, 9]) {
      const result = expand(count);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const inputs = batchInputs(result);
      const wired = Object.keys(inputs).filter((key) => /^image_\d+$/.test(key));
      // The property that matters: never more slots wired than declared, and
      // never fewer — the two must describe the same thing.
      expect(inputs.inputcount).toBe(count);
      expect(wired).toHaveLength(count);
    }
  });

  it("lowers inputcount too, when fewer images are selected than the node declared", () => {
    const result = expand(1, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Leaving it at 4 would make the node read three slots that no longer
    // exist. It follows the selection down as well as up.
    expect(batchInputs(result).inputcount).toBe(1);
  });

  it("invents no widget for a batch node that never had one", () => {
    // A dynamic-batch node is detected by its title alone, so one without an
    // inputcount widget must be left exactly as it was.
    const wf = workflowWithBatch(2) as unknown as Record<string, { inputs: Record<string, unknown> }>;
    delete wf["13"].inputs.inputcount;

    const result = expandDynamicBatchWorkflow({
      workflowJson: JSON.stringify(wf),
      selectedImages: images(3),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("inputcount" in batchInputs(result)).toBe(false);
  });
});
