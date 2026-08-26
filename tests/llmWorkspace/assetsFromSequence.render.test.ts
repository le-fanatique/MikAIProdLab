import { describe, expect, it } from "vitest";
import {
  renderAssetsFromSequenceSequenceBlock,
  renderAssetsFromSequenceShotsBlock,
  renderAssetsFromSequenceFinalInstructionLine,
  renderAssetsFromSequenceSystemBody,
  type SeqContextData,
  type SeqShotTargetEntry,
  type ProjectIdentityData,
  type VariableParameterRenderInput,
} from "@/lib/llmWorkspace/variables/registry";

// ---------------------------------------------------------------------------
// ASSET.EXTRACT.SEQ.1 — unit-level proof for the three render forms unique to
// `assets.fromSequence` (the two blocks it does not share with
// `assetsFromProject`, plus its own closing instruction and system body).
// There is no pre-existing oracle to reproduce byte-for-byte (this operation
// is new, §4b of the ticket) — these tests fix the contract directly, and are
// the ones exercised by the mutation net in `.agents/executor_report.md`.
// ---------------------------------------------------------------------------

describe("assetsFromSequence render forms", () => {
  it("renderAssetsFromSequenceSequenceBlock: always non-empty, one line, only present fields joined", () => {
    const full: SeqContextData = {
      title: "Reactor breach",
      summary: "The crew breaches the control room.",
      description: "A tense infiltration.",
      narrativePurpose: "Raises the stakes.",
      mood: "Tense",
      locationHint: "Interior reactor control room",
    };
    expect(renderAssetsFromSequenceSequenceBlock(full)).toBe(
      "SEQUENCE:\n- Reactor breach | Summary: The crew breaches the control room. | Description: A tense infiltration. | Purpose: Raises the stakes. | Mood: Tense | Location: Interior reactor control room"
    );

    const bare: SeqContextData = {
      title: "Only sequence",
      summary: null,
      description: null,
      narrativePurpose: null,
      mood: null,
      locationHint: null,
    };
    expect(renderAssetsFromSequenceSequenceBlock(bare)).toBe("SEQUENCE:\n- Only sequence");
  });

  it("renderAssetsFromSequenceShotsBlock: empty when there are no shots, one line per shot otherwise, no truncation", () => {
    expect(renderAssetsFromSequenceShotsBlock([])).toBe("");

    const longDescription = "D".repeat(3000);
    const entries: SeqShotTargetEntry[] = [
      {
        id: 1,
        shotCode: "SH010",
        title: "Wide of the control room",
        description: longDescription,
        actionPitch: "The crew breaches the door.",
        continuityIn: "Calm corridor.",
        continuityOut: "Door breached.",
      },
      { id: 2, shotCode: null, title: "Close on the console", description: null, actionPitch: null, continuityIn: null, continuityOut: null },
    ];
    const rendered = renderAssetsFromSequenceShotsBlock(entries);
    expect(rendered).toBe(
      `SHOTS:\n- Wide of the control room | ${longDescription} | Action: The crew breaches the door. | In: Calm corridor. | Out: Door breached.\n- Close on the console`
    );
    // No truncation — the full 3000-character description survives.
    expect(rendered).toContain(longDescription);
  });

  it("renderAssetsFromSequenceFinalInstructionLine: states the incremental rule and the requested types", () => {
    expect(renderAssetsFromSequenceFinalInstructionLine(["character", "prop"])).toBe(
      "Extract up to 20 production assets from this sequence that are missing from the existing project asset list above — do not propose one that is already there. Asset types to include: character, prop."
    );
  });

  it("renderAssetsFromSequenceSystemBody: names the project and the sequence, and states the incremental rule explicitly", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: null,
      story: null,
      description: null,
      outline: null,
    };
    const seq: SeqContextData = {
      title: "Reactor breach",
      summary: null,
      description: null,
      narrativePurpose: null,
      mood: null,
      locationHint: null,
    };
    const input: VariableParameterRenderInput = {
      variables: { "PROJECT.IDENTITY": project, "SEQ.CONTEXT": seq },
      parameters: { assetTypes: ["character"] },
      mode: undefined,
    };
    const body = renderAssetsFromSequenceSystemBody(input);
    expect(body).toContain('project "Neon Skyline"');
    expect(body).toContain('sequence "Reactor breach"');
    expect(body).toMatch(/incremental extraction/i);
    expect(body).toMatch(/only propose assets that are missing/i);
    expect(body).toContain("Asset types to extract: character");
  });
});
