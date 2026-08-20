import { describe, expect, it } from "vitest";
import { orderStoryboardReferences } from "@/lib/prompts/orderStoryboardReferences";
import { expandDynamicBatchWorkflow } from "@/lib/comfy/expandDynamicBatch";

// ---------------------------------------------------------------------------
// IND.REFORDER.1 — which image carries which `@ImageN`.
//
// The prompt tells the model "@Image3 is the environment". If position 3 of
// what is actually sent holds something else, the prompt lies and nothing
// reports it — the same silent shape as the `inputcount` bug found in daily
// use, where extra images were queued and quietly ignored.
//
// The last test is the one that matters most: it checks the label order
// against what the batch expander really wires, so the two cannot drift apart
// without a test noticing.
// ---------------------------------------------------------------------------

type Meta = { refId: string; assetName: string };

const meta = (ids: string[]) => new Map(ids.map((id) => [id, { refId: id, assetName: `asset-${id}` }]));
const available = (ids: string[]) => ids.map((id) => ({ id }));

describe("orderStoryboardReferences", () => {
  it("follows the batch's own order when a Dynamic Batch node is present", () => {
    const result = orderStoryboardReferences<Meta>({
      hasDynamicBatch: true,
      // The user reordered inside the batch panel: c, a, b.
      batchSelectedIds: ["c", "a", "b"],
      availableImages: available(["a", "b", "c"]),
      metaByRefId: meta(["a", "b", "c"]),
    });

    // Never the display order — the batch is what is actually sent.
    expect(result.orderedIds).toEqual(["c", "a", "b"]);
    expect(result.references.map((r) => r.refId)).toEqual(["c", "a", "b"]);
  });

  it("honours a narrowed batch selection, not the full list", () => {
    const result = orderStoryboardReferences<Meta>({
      hasDynamicBatch: true,
      batchSelectedIds: ["b"],
      availableImages: available(["a", "b", "c"]),
      metaByRefId: meta(["a", "b", "c"]),
    });

    expect(result.orderedIds).toEqual(["b"]);
    expect(result.references).toHaveLength(1);
  });

  it("falls back to the available order only when there is no batch node", () => {
    const result = orderStoryboardReferences<Meta>({
      hasDynamicBatch: false,
      // Deliberately non-empty, and deliberately ignored.
      batchSelectedIds: ["c"],
      availableImages: available(["a", "b", "c"]),
      metaByRefId: meta(["a", "b", "c"]),
    });

    expect(result.orderedIds).toEqual(["a", "b", "c"]);
  });

  it("drops an id with no metadata instead of leaving a hole", () => {
    const result = orderStoryboardReferences<Meta>({
      hasDynamicBatch: true,
      batchSelectedIds: ["a", "ghost", "b"],
      availableImages: available(["a", "b"]),
      metaByRefId: meta(["a", "b"]),
    });

    // A hole would shift every later label by one — the precise silent
    // mismatch this function exists to prevent.
    expect(result.references.map((r) => r.refId)).toEqual(["a", "b"]);
    expect(result.references.every((r) => r !== undefined)).toBe(true);
  });

  it("labels in the same order the batch expander actually wires — the invariant", () => {
    const selected = ["c", "a", "b"];

    const labels = orderStoryboardReferences<Meta>({
      hasDynamicBatch: true,
      batchSelectedIds: selected,
      availableImages: available(["a", "b", "c"]),
      metaByRefId: meta(["a", "b", "c"]),
    }).references.map((r) => r.refId);

    const expanded = expandDynamicBatchWorkflow({
      workflowJson: JSON.stringify({
        "13": {
          inputs: { inputcount: 2, image_1: ["28", 0] },
          class_type: "ImageBatchMulti",
          _meta: { title: "Make Image Batch (Dynamic Batch Input)" },
        },
        "28": { inputs: { image: "t.png" }, class_type: "LoadImage", _meta: { title: "Load Image  (Repeatable)" } },
      }),
      selectedImages: selected.map((id) => ({ id, imagePath: `${id}.png` })),
    });
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;

    // What the expander wired, slot by slot, resolved back to its image file.
    const wf = JSON.parse(expanded.workflowJson) as Record<string, { inputs: Record<string, unknown> }>;
    const batch = wf["13"].inputs;
    const sentOrder = Object.keys(batch)
      .filter((k) => /^image_\d+$/.test(k))
      .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
      .map((k) => {
        const [sourceId] = batch[k] as [string, number];
        return String(wf[sourceId].inputs.image).replace(".png", "");
      });

    // @Image1 must be the first image actually sent, and so on down.
    expect(labels).toEqual(sentOrder);
  });
});
