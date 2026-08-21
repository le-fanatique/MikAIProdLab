import { describe, expect, it } from "vitest";
import { narrativePromptComposeDescriptor } from "@/lib/llmWorkspace/descriptors/narrativePrompt";
import {
  NARRATIVE_PROMPT_SYSTEM_INTRO,
  NARRATIVE_PROMPT_SYSTEM_RULES,
  renderNarrativePromptContextLines,
  type ProjectIdentityData,
  type SeqContextData,
  type ShotCastEntry,
  type ShotCoreData,
  type ShotCurrentPromptData,
  type ShotReferenceEntry,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// LLMW.NARRATIVE.1 (B12b-2) — render proof for `narrativePrompt.compose`, on
// the model of `shotPrompt.assist.render.test.ts` (the closest sibling: same
// six variables, same anchor) but with no oracle to reproduce byte-for-byte
// (this is a new operation, authored for this ticket, not a flat-JSON
// migration) — the proof here is instead:
//   1. the assembled prompt contains the six ingredients, in the declared
//      order;
//   2. the system message carries the ticket's own required constraints
//      (prose, no JSON/markdown, one proposal, narrative fidelity);
//   3. the descriptor declares no mode, no freeText, no preconditions — the
//      "always the same way" contract of §5.3.
// ---------------------------------------------------------------------------

type Fixture = {
  project: ProjectIdentityData;
  seq: SeqContextData;
  shot: ShotCoreData;
  currentPrompt: ShotCurrentPromptData;
  cast: ShotCastEntry[];
  references: ShotReferenceEntry[];
};

function assemble(fixture: Fixture) {
  return assembleDescriptorMessages(
    narrativePromptComposeDescriptor,
    () => {
      throw new Error("narrativePrompt.compose declares no {variable} block.");
    },
    undefined,
    undefined,
    (variableIds, render) => {
      const key = variableIds.join(",");
      if (
        key === "PROJECT.IDENTITY,SEQ.CONTEXT,SHOT.CORE,SHOT.CURRENT_PROMPT,SHOT.CAST,SHOT.REFERENCES" &&
        render === "narrativePrompt.contextLines"
      ) {
        return renderNarrativePromptContextLines(
          fixture.project,
          fixture.seq,
          fixture.shot,
          fixture.currentPrompt,
          fixture.cast,
          fixture.references
        );
      }
      throw new Error(`unexpected variables block ${key}::${render}`);
    }
  );
}

const COMPLETE_FIXTURE: Fixture = {
  project: {
    name: "Neon Skyline",
    pitch: "A courier races across a rain-soaked megacity.",
    story: "A long story text.".repeat(30),
    description: null,
    outline: null,
  },
  seq: {
    title: "The Chase",
    summary: "A rooftop pursuit.",
    description: "Fast cuts, neon reflections.",
    mood: "Tense",
    locationHint: "Downtown rooftops",
    narrativePurpose: null,
  },
  shot: {
    title: "Rooftop Sprint",
    shotCode: "S12",
    description: "The courier leaps between buildings.",
    actionPitch: "Sprinting, leaping.",
    cameraSubject: "Low tracking shot.",
    framing: "Wide",
    cameraMovement: "Tracking",
    durationSeconds: 4,
  },
  currentPrompt: { shotPrompt: "An existing draft the model may draw on." },
  cast: [
    { name: "Courier", type: "character", description: "Weathered jacket.", notes: "Protagonist." },
    { name: "Drone", type: "prop", description: null, notes: null },
  ],
  references: [
    { label: "Rooftop ref", imageRole: "reference", sourceFilename: "rooftop.png" },
    { label: null, imageRole: "reference", sourceFilename: "night.png" },
  ],
};

const MINIMAL_FIXTURE: Fixture = {
  project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
  seq: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null, narrativePurpose: null },
  shot: {
    title: "Untitled Shot",
    shotCode: null,
    description: null,
    actionPitch: null,
    cameraSubject: null,
    framing: null,
    cameraMovement: null,
    durationSeconds: null,
  },
  currentPrompt: { shotPrompt: null },
  cast: [],
  references: [],
};

describe("narrativePrompt.compose descriptor — render proof", () => {
  it("declares exactly the six shotPrompt.assist ingredients, in order, none user-adjustable", () => {
    expect(narrativePromptComposeDescriptor.context.variables).toEqual([
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "SEQ.CONTEXT", userAdjustable: false },
      { id: "SHOT.CORE", userAdjustable: false },
      { id: "SHOT.CURRENT_PROMPT", userAdjustable: false },
      { id: "SHOT.CAST", userAdjustable: false },
      { id: "SHOT.REFERENCES", userAdjustable: false },
    ]);
    // SHOT.NARRATIVE_PROMPT is deliberately absent — it is this operation's
    // own output, not an ingredient.
    expect(
      narrativePromptComposeDescriptor.context.variables.some((v) => v.id === "SHOT.NARRATIVE_PROMPT")
    ).toBe(false);
  });

  it("declares no mode, no freeText, no parameters, and no preconditions — the 'always the same way' contract", () => {
    expect(narrativePromptComposeDescriptor.intent).toEqual({});
    expect(narrativePromptComposeDescriptor.preconditions).toBeUndefined();
  });

  it("the assembled user prompt contains all six ingredients, in the declared order", () => {
    const assembled = assemble(COMPLETE_FIXTURE);
    const positions = [
      "Project: Neon Skyline",
      "Sequence: The Chase",
      "Shot: S12",
      "Current shot prompt: An existing draft",
      "Cast: Courier",
      "References: Rooftop ref",
    ].map((needle) => assembled.user.indexOf(needle));

    for (const p of positions) expect(p).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("renders a minimal context (nothing beyond the required fields) without throwing, and still contains project/sequence/shot", () => {
    const assembled = assemble(MINIMAL_FIXTURE);
    expect(assembled.user).toContain("Project: Untitled Project");
    expect(assembled.user).toContain("Sequence: Untitled Sequence");
    expect(assembled.user).toContain("Shot: Untitled Shot");
    expect(assembled.user).not.toContain("Cast:");
    expect(assembled.user).not.toContain("References:");
    expect(assembled.user).not.toContain("Current shot prompt:");
  });

  it("the system message carries the ticket's required constraints: prose, no JSON/markdown, one proposal, narrative fidelity", () => {
    const assembled = assemble(COMPLETE_FIXTURE);
    expect(assembled.system).toContain(NARRATIVE_PROMPT_SYSTEM_INTRO);
    expect(assembled.system).toContain(NARRATIVE_PROMPT_SYSTEM_RULES);
    expect(assembled.system).toMatch(/No JSON, no markdown, no code fences/);
    expect(assembled.system).toMatch(/single paragraph, never a list of options/);
    expect(assembled.system).toMatch(/Do not invent characters, locations, or actions/);
    expect(assembled.system).not.toContain("```");
  });

  it("output declares kind: \"text\", target shot, field \"narrativePrompt\", and consumes it via commit: [\"updateShotNarrativePrompt\"]", () => {
    expect(narrativePromptComposeDescriptor.output).toEqual({
      kind: "text",
      target: { entity: "shot" },
      field: "narrativePrompt",
      errors: { empty: "The model returned an empty narrative prompt. Try again." },
    });
    expect(narrativePromptComposeDescriptor.commit).toEqual(["updateShotNarrativePrompt"]);
  });
});
