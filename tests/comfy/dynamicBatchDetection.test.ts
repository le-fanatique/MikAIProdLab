import { describe, expect, it } from "vitest";
import { detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import { pruneDynamicBatchIds } from "@/lib/comfy/pruneDynamicBatchSelection";

// ---------------------------------------------------------------------------
// The two decisions in the Dynamic Batch path that nothing tested.
//
// `detectDynamicBatchUiInfo` decides whether the generate page offers a batch
// selection at all, and which node the expansion will target.
// `pruneDynamicBatchIds` decides which of a previously selected set survives a
// change to the casting it was drawn from.
//
// Both fail the same way as the `inputcount` bug found in daily use: no error,
// no warning, simply the wrong images sent — or the right images in the wrong
// order, which silently invalidates every `@ImageN` label in the prompt.
//
// Characterization: these record what the code does today.
// ---------------------------------------------------------------------------

const batchWorkflow = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
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
    ...extra,
  });

describe("detectDynamicBatchUiInfo", () => {
  it("reports a connected Dynamic Batch node as ready, and names the node the expansion will target", () => {
    const info = detectDynamicBatchUiInfo(batchWorkflow());

    expect(info.kind).toBe("ready");
    if (info.kind !== "ready") return;
    expect(info.batchNodeId).toBe("13");
    expect(info.mode).toBe("dynamic-batch");
  });

  it("strips the detection marker out of the title shown to the user", () => {
    const info = detectDynamicBatchUiInfo(batchWorkflow());

    if (info.kind !== "ready") throw new Error("expected ready");
    // The marker is how the node is found; it is not something to display.
    expect(info.batchTitle).toBe("Make Image Batch");
    expect(info.batchTitle).not.toContain("(Dynamic Batch Input)");
  });

  it("reports the upstream template chain, which is what gets cloned per image", () => {
    const info = detectDynamicBatchUiInfo(batchWorkflow());

    if (info.kind !== "ready") throw new Error("expected ready");
    expect(info.templateChainNodeIds).toContain("28");
    expect(info.templateChainTitles.length).toBe(info.templateChainNodeIds.length);
  });

  it("returns `none` — not an error — for a workflow that simply has no batch node", () => {
    const plain = JSON.stringify({
      "1": { inputs: { image: "a.png" }, class_type: "LoadImage", _meta: { title: "Load Image" } },
    });

    // The distinction matters: `none` is a normal single-image workflow, while
    // `error` is a workflow the user must go fix.
    expect(detectDynamicBatchUiInfo(plain).kind).toBe("none");
  });

  it("returns an error, never a throw, on unparseable JSON", () => {
    const info = detectDynamicBatchUiInfo("{ not json");

    expect(info.kind).toBe("error");
    if (info.kind !== "error") return;
    expect(info.message).toBe("Invalid workflow JSON.");
  });

  it("refuses to guess when two Dynamic Batch nodes are connected", () => {
    const two = batchWorkflow({
      "14": {
        inputs: { inputcount: 2, image_1: ["28", 0] },
        class_type: "ImageBatchMulti",
        _meta: { title: "Second Batch (Dynamic Batch Input)" },
      },
    });

    // Picking one silently would send the images into a node the author did
    // not mean — exactly the class of failure this whole path is prone to.
    const info = detectDynamicBatchUiInfo(two);
    expect(info.kind).toBe("error");
  });

  it("ignores a Dynamic Batch node whose image input is not connected", () => {
    const disconnected = JSON.stringify({
      "13": {
        inputs: { inputcount: 2 },
        class_type: "ImageBatchMulti",
        _meta: { title: "Make Image Batch (Dynamic Batch Input)" },
      },
    });

    expect(detectDynamicBatchUiInfo(disconnected).kind).toBe("none");
  });
});

describe("pruneDynamicBatchIds", () => {
  it("drops ids no longer in the casting, keeping the rest in their existing order", () => {
    expect(pruneDynamicBatchIds(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(pruneDynamicBatchIds(["c", "a", "b"], ["a", "c"])).toEqual(["c", "a"]);
  });

  it("never adds a newly cast reference to an existing selection", () => {
    // Documented intent: "Add From Casting" is the deliberate action for that.
    // Auto-joining would change what is sent without the author asking.
    expect(pruneDynamicBatchIds(["a"], ["a", "b", "c"])).toEqual(["a"]);
  });

  it("returns empty when the casting no longer contains anything selected", () => {
    expect(pruneDynamicBatchIds(["a", "b"], [])).toEqual([]);
    expect(pruneDynamicBatchIds(["a", "b"], ["z"])).toEqual([]);
  });

  it("preserves order rather than reordering to match the casting", () => {
    // The selection order is the send order, so re-sorting here would shift
    // every `@ImageN` label by an unpredictable amount.
    expect(pruneDynamicBatchIds(["c", "b", "a"], ["a", "b", "c"])).toEqual(["c", "b", "a"]);
  });

  it("CHARACTERIZATION: a duplicated id survives duplicated — it is not de-duplicated here", () => {
    expect(pruneDynamicBatchIds(["a", "a"], ["a"])).toEqual(["a", "a"]);
  });

  it("does not mutate its inputs", () => {
    const current = ["a", "b"];
    const allowed = ["a"];
    pruneDynamicBatchIds(current, allowed);
    expect(current).toEqual(["a", "b"]);
    expect(allowed).toEqual(["a"]);
  });
});
