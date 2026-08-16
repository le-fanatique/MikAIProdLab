import { describe, expect, it } from "vitest";
import {
  buildBenchDraftFields,
  isBenchReturnToQueryKey,
  planBenchCommit,
  preservedAssetDetailColumns,
  resolveBenchConfirmation,
  type BenchCommitPlan,
} from "@/lib/llmWorkspace/benchRun";
import { DESCRIPTORS, assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.BENCH.RUN.1 (B6c1), §5 — pure proof for `benchRun.ts`. No database, no
// LLM call, no component: every decision this ticket makes lives here.
// ---------------------------------------------------------------------------

describe("planBenchCommit — the eight built-ins", () => {
  it("resolves the seven mono-entity descriptors with the right kind and actionId", () => {
    expect(planBenchCommit(DESCRIPTORS["story.generate"])).toEqual({
      kind: "returnValue",
      actionId: "applyGeneratedStory",
    });
    expect(planBenchCommit(DESCRIPTORS["outline.generate"])).toEqual({
      kind: "returnValue",
      actionId: "applyGeneratedOutline",
    });
    expect(planBenchCommit(DESCRIPTORS["assetBible.generate"])).toEqual({
      kind: "returnValue",
      actionId: "updateAssetDetailsInline",
    });
    expect(planBenchCommit(DESCRIPTORS["assetDescription.generate"])).toEqual({
      kind: "returnValue",
      actionId: "updateAssetDescriptionFieldInline",
    });
    expect(planBenchCommit(DESCRIPTORS["assetNotes.generate"])).toEqual({
      kind: "returnValue",
      actionId: "updateAssetDescriptionFieldInline",
    });
    expect(planBenchCommit(DESCRIPTORS["sequencePrompt.assist"])).toEqual({
      kind: "redirectOnly",
      actionId: "updateSequencePrompt",
    });
    expect(planBenchCommit(DESCRIPTORS["shotPrompt.assist"])).toEqual({
      kind: "redirectOnly",
      actionId: "updateShotPrompt",
    });
  });

  it("refuses the entitySet batch descriptor as unsupported", () => {
    const plan = planBenchCommit(DESCRIPTORS["assetDescription.batch"]);
    expect(plan.kind).toBe("unsupported");
    expect(plan.kind === "unsupported" && plan.reason).toBe("Batch operations cannot be approved from the bench.");
  });
});

describe("planBenchCommit — a stored-shaped descriptor", () => {
  it("refuses a template declaring no commit action", () => {
    const stored: OperationDescriptor = { ...assetBibleGenerateDescriptor, commit: [] };
    const plan = planBenchCommit(stored);
    expect(plan.kind).toBe("unsupported");
    expect(plan.kind === "unsupported" && plan.reason).toBe("This template declares no single commit action.");
  });

  it("refuses a template declaring two commit actions", () => {
    const stored: OperationDescriptor = {
      ...assetBibleGenerateDescriptor,
      commit: ["updateAssetDetailsInline", "applyGeneratedStory"],
    };
    const plan = planBenchCommit(stored);
    expect(plan.kind).toBe("unsupported");
    expect(plan.kind === "unsupported" && plan.reason).toBe("This template declares no single commit action.");
  });
});

describe("buildBenchDraftFields", () => {
  it("respects the declared fields' order and defaults a missing value to \"\"", () => {
    // `output.kind` is always `"object"` for this descriptor
    // (LLMW.OUTPUT.LIST.1, B7a).
    const output = assetBibleGenerateDescriptor.output;
    if (output.kind !== "object") throw new Error("unreachable");
    const fields = output.fields;
    const result = buildBenchDraftFields(fields, { usageRules: "kept" });

    expect(result).toEqual([
      { field: "visualIdentity", value: "" },
      { field: "usageRules", value: "kept" },
      { field: "forbiddenVariations", value: "" },
    ]);
  });
});

describe("preservedAssetDetailColumns", () => {
  it("derives [\"description\", \"notes\"] for assetBible.generate from the registry, not hard-coded", () => {
    expect(preservedAssetDetailColumns(assetBibleGenerateDescriptor)).toEqual(["description", "notes"]);
  });
});

describe("isBenchReturnToQueryKey — supervisor review retake, post-B6c1", () => {
  it("excludes the four confirmation parameters updateShotPrompt / updateSequencePrompt append on redirect", () => {
    // src/actions/shots.ts:594,628 and src/actions/sequences.ts:283,306 —
    // read off the real actions, not guessed.
    expect(isBenchReturnToQueryKey("shotPromptError")).toBe(false);
    expect(isBenchReturnToQueryKey("shotPromptSaved")).toBe(false);
    expect(isBenchReturnToQueryKey("sequencePromptError")).toBe(false);
    expect(isBenchReturnToQueryKey("sequencePromptSaved")).toBe(false);
  });

  it("excludes createGeneratedShots' two confirmation parameters (LLMW.PROPOSAL.LIST.1, B7d)", () => {
    // src/actions/llm/sequenceShots.ts:140,213 — read off the real action.
    expect(isBenchReturnToQueryKey("shotsCreateError")).toBe(false);
    expect(isBenchReturnToQueryKey("shotsCreated")).toBe(false);
  });

  it("keeps every ordinary bench selection/intent key", () => {
    expect(isBenchReturnToQueryKey("projectId")).toBe(true);
    expect(isBenchReturnToQueryKey("sequenceId")).toBe(true);
    expect(isBenchReturnToQueryKey("shotId")).toBe(true);
    expect(isBenchReturnToQueryKey("assetId")).toBe(true);
    expect(isBenchReturnToQueryKey("mode")).toBe(true);
    expect(isBenchReturnToQueryKey("targetSections")).toBe(true);
  });
});

describe("resolveBenchConfirmation — LLMW.BENCH.CONFIRM.1 (B7d-f)", () => {
  const shotPromptPlan: BenchCommitPlan = { kind: "redirectOnly", actionId: "updateShotPrompt" };
  const sequencePromptPlan: BenchCommitPlan = { kind: "redirectOnly", actionId: "updateSequencePrompt" };
  const shotsCreatedPlan: BenchCommitPlan = { kind: "redirectOnly", actionId: "createGeneratedShots" };

  it("renders the plural count for createGeneratedShots", () => {
    expect(resolveBenchConfirmation(shotsCreatedPlan, { shotsCreated: "2" })).toEqual({
      kind: "success",
      message: "2 shots created.",
    });
  });

  it("renders the singular count for createGeneratedShots", () => {
    expect(resolveBenchConfirmation(shotsCreatedPlan, { shotsCreated: "1" })).toEqual({
      kind: "success",
      message: "1 shot created.",
    });
  });

  it("renders nothing for createGeneratedShots when the count is 0, non-numeric, or absent", () => {
    expect(resolveBenchConfirmation(shotsCreatedPlan, { shotsCreated: "0" })).toBeNull();
    expect(resolveBenchConfirmation(shotsCreatedPlan, { shotsCreated: "not-a-number" })).toBeNull();
    expect(resolveBenchConfirmation(shotsCreatedPlan, {})).toBeNull();
  });

  it("renders the error for createGeneratedShots verbatim", () => {
    expect(resolveBenchConfirmation(shotsCreatedPlan, { shotsCreateError: "No valid shots to create." })).toEqual({
      kind: "error",
      message: "No valid shots to create.",
    });
  });

  it("renders success for updateShotPrompt only when the value is exactly \"1\"", () => {
    expect(resolveBenchConfirmation(shotPromptPlan, { shotPromptSaved: "1" })).toEqual({
      kind: "success",
      message: "Shot Prompt saved.",
    });
    expect(resolveBenchConfirmation(shotPromptPlan, { shotPromptSaved: "2" })).toBeNull();
  });

  it("renders the error for updateShotPrompt verbatim", () => {
    expect(resolveBenchConfirmation(shotPromptPlan, { shotPromptError: "Shot not found." })).toEqual({
      kind: "error",
      message: "Shot not found.",
    });
  });

  it("renders success for updateSequencePrompt only when the value is exactly \"1\"", () => {
    expect(resolveBenchConfirmation(sequencePromptPlan, { sequencePromptSaved: "1" })).toEqual({
      kind: "success",
      message: "Sequence Prompt saved.",
    });
    expect(resolveBenchConfirmation(sequencePromptPlan, { sequencePromptSaved: "2" })).toBeNull();
  });

  it("renders the error for updateSequencePrompt verbatim", () => {
    expect(resolveBenchConfirmation(sequencePromptPlan, { sequencePromptError: "Sequence not found." })).toEqual({
      kind: "error",
      message: "Sequence not found.",
    });
  });

  it("renders the error alone when both the success and the error key are present", () => {
    expect(
      resolveBenchConfirmation(shotsCreatedPlan, { shotsCreated: "2", shotsCreateError: "Partial failure." })
    ).toEqual({ kind: "error", message: "Partial failure." });
  });

  it("renders nothing for a returnValue or an unsupported plan", () => {
    const returnValuePlan: BenchCommitPlan = { kind: "returnValue", actionId: "applyGeneratedStory" };
    const unsupportedPlan: BenchCommitPlan = { kind: "unsupported", reason: "n/a" };
    expect(resolveBenchConfirmation(returnValuePlan, { shotPromptSaved: "1" })).toBeNull();
    expect(resolveBenchConfirmation(unsupportedPlan, { shotPromptSaved: "1" })).toBeNull();
  });
});
