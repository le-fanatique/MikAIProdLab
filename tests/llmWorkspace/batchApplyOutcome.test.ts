import { describe, it, expect } from "vitest";
import { resolveBatchApplyOutcome } from "@/lib/llmWorkspace/batchApplyOutcome";

describe("resolveBatchApplyOutcome", () => {
  it("all applied — every item written, no errors: green, no failures listed", () => {
    const outcome = resolveBatchApplyOutcome(
      [
        { assetId: 1, descriptionApplied: true, notesApplied: false },
        { assetId: 2, descriptionApplied: false, notesApplied: true },
      ],
      [],
      "replace"
    );

    expect(outcome.status).toBe("all");
    expect(outcome.tone).toBe("success");
    expect(outcome.message).toBe("Batch replaced: 2 assets updated.");
    expect(outcome.failures).toEqual([]);
  });

  it("partially applied — some written, some refused: amber, both counts and failures", () => {
    const outcome = resolveBatchApplyOutcome(
      [{ assetId: 1, descriptionApplied: true, notesApplied: false }],
      [
        { assetId: 2, error: "Both drafts are empty." },
        { assetId: 3, error: "Asset not found." },
      ],
      "append"
    );

    expect(outcome.status).toBe("partial");
    expect(outcome.tone).toBe("warning");
    expect(outcome.message).toBe("Batch appended: 1 of 3 assets updated. 2 failed.");
    expect(outcome.failures).toEqual([
      { assetId: 2, error: "Both drafts are empty." },
      { assetId: 3, error: "Asset not found." },
    ]);
  });

  it("nothing applied — every item refused, applied: [], ok: true from the action: red, not a success", () => {
    const outcome = resolveBatchApplyOutcome(
      [],
      [
        { assetId: 1, error: "Asset not found." },
        { assetId: 2, error: "Asset not found." },
      ],
      "replace"
    );

    expect(outcome.status).toBe("none");
    expect(outcome.tone).toBe("error");
    expect(outcome.message).toBe("No changes were saved. 2 assets failed.");
    expect(outcome.failures).toEqual([
      { assetId: 1, error: "Asset not found." },
      { assetId: 2, error: "Asset not found." },
    ]);
  });

  it("all applied is decided from applied/errors only, independent of any upstream generation errors", () => {
    // `state.errors` (generation failures, already shown elsewhere in the
    // panel) is a different source from `result.errors` (application
    // failures) and is never passed to this function. An outcome computed
    // from a fully-successful apply call must stay green even though the
    // generation step for other, unselected assets may have failed earlier
    // in the same session.
    const outcome = resolveBatchApplyOutcome(
      [
        { assetId: 1, descriptionApplied: true, notesApplied: true },
        { assetId: 2, descriptionApplied: true, notesApplied: false },
        { assetId: 3, descriptionApplied: false, notesApplied: true },
      ],
      [],
      "replace"
    );

    expect(outcome.status).toBe("all");
    expect(outcome.tone).toBe("success");
    expect(outcome.message).toBe("Batch replaced: 3 assets updated.");
    expect(outcome.failures).toEqual([]);
  });

  it("singular wording for a single asset in each direction", () => {
    const all = resolveBatchApplyOutcome(
      [{ assetId: 1, descriptionApplied: true, notesApplied: false }],
      [],
      "replace"
    );
    expect(all.message).toBe("Batch replaced: 1 asset updated.");

    const none = resolveBatchApplyOutcome([], [{ assetId: 1, error: "Asset not found." }], "replace");
    expect(none.message).toBe("No changes were saved. 1 asset failed.");
  });
});
