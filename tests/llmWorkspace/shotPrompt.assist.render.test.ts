import { describe, expect, it } from "vitest";
import { shotPromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/shotPrompt";
import {
  renderShotPromptGenerateContextLines,
  renderShotCurrentPromptTransformBlock,
  renderShotPromptGenerateSystemBody,
  renderShotPromptTransformSystemBody,
  renderShotPromptClosingLine,
  type ProjectIdentityData,
  type SeqContextData,
  type ShotCoreData,
  type ShotCastEntry,
  type ShotReferenceEntry,
  type ShotCurrentPromptData,
  type ShotPromptAssistModeId,
} from "@/lib/llmWorkspace/variables/registry";
import {
  buildShotPromptFromContextPrompt,
  type BuildShotPromptFromContextInput,
} from "@/lib/prompts/shot-prompt-from-context";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `shotPromptAssistDescriptor`'s blocks must equal, byte-for-byte, what
// `buildShotPromptFromContextPrompt` produces for the same input. Four
// entries, mirroring `sequencePrompt.assist.render.test.ts`: complete and
// minimal on both sides of the generate/transform mode branch.
// ---------------------------------------------------------------------------

type Fixture = {
  mode: ShotPromptAssistModeId;
  project: ProjectIdentityData;
  seq: SeqContextData;
  shot: ShotCoreData;
  cast: ShotCastEntry[];
  references: ShotReferenceEntry[];
  currentPrompt: ShotCurrentPromptData;
};

function assemble(fixture: Fixture) {
  return assembleDescriptorMessages(
    shotPromptAssistDescriptor,
    () => {
      throw new Error("shotPrompt.assist declares no single-variable {variable} block.");
    },
    undefined, // no `{parameter}` block on this descriptor
    (render) => {
      switch (render) {
        case "shotPrompt.generateSystemBody":
          return renderShotPromptGenerateSystemBody(fixture.mode);
        case "shotPrompt.transformSystemBody":
          return renderShotPromptTransformSystemBody(fixture.mode);
        case "shotPrompt.closingLine":
          return renderShotPromptClosingLine(fixture.mode);
        default:
          throw new Error(`unexpected mode render ${render}`);
      }
    },
    (variableIds, render) => {
      const key = variableIds.join(",");
      if (key === "PROJECT.IDENTITY,SEQ.CONTEXT,SHOT.CORE,SHOT.CAST,SHOT.REFERENCES,SHOT.CURRENT_PROMPT" && render === "shotPrompt.generateContextLines") {
        return renderShotPromptGenerateContextLines(
          fixture.project,
          fixture.seq,
          fixture.shot,
          fixture.cast,
          fixture.references,
          fixture.currentPrompt,
          fixture.mode
        );
      }
      if (key === "SHOT.CURRENT_PROMPT,SHOT.CORE,SEQ.CONTEXT" && render === "shotPrompt.transformBlock") {
        return renderShotCurrentPromptTransformBlock(fixture.currentPrompt, fixture.shot, fixture.seq, fixture.mode);
      }
      throw new Error(`unexpected variables block ${key}::${render}`);
    }
  );
}

function toBuilderInput(fixture: Fixture): BuildShotPromptFromContextInput {
  const castSummary = fixture.cast.map((r) => {
    const extras = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join("; ");
    return extras ? `${r.name} (${r.type}: ${extras})` : `${r.name} (${r.type})`;
  });
  const referenceSummary = fixture.references
    .map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null)
    .filter((v): v is string => v !== null);
  return {
    assistMode: fixture.mode,
    projectName: fixture.project.name,
    projectPitch: fixture.project.pitch,
    projectStory: fixture.project.story,
    sequenceTitle: fixture.seq.title,
    sequenceSummary: fixture.seq.summary,
    sequenceDescription: fixture.seq.description,
    sequenceMood: fixture.seq.mood,
    sequenceLocationHint: fixture.seq.locationHint,
    shotTitle: fixture.shot.title,
    shotCode: fixture.shot.shotCode,
    shotDescription: fixture.shot.description,
    actionPitch: fixture.shot.actionPitch,
    cameraPitch: fixture.shot.cameraPitch,
    framing: fixture.shot.framing,
    cameraMovement: fixture.shot.cameraMovement,
    durationSeconds: fixture.shot.durationSeconds,
    currentShotPrompt: fixture.currentPrompt.shotPrompt,
    castSummary,
    referenceSummary,
  };
}

describe("shotPrompt.assist descriptor — strict prompt equality", () => {
  it("matches buildShotPromptFromContextPrompt for generate mode, complete context", () => {
    const fixture: Fixture = {
      mode: "generate",
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
      },
      shot: {
        title: "Rooftop Sprint",
        shotCode: "S12",
        description: "The courier leaps between buildings.",
        actionPitch: "Sprinting, leaping.",
        cameraPitch: "Low tracking shot.",
        framing: "Wide",
        cameraMovement: "Tracking",
        durationSeconds: 4,
      },
      cast: [
        { name: "Courier", type: "character", description: "Weathered jacket.", notes: "Protagonist." },
        { name: "Drone", type: "prop", description: null, notes: null },
      ],
      references: [
        { label: "Rooftop ref", imageRole: "reference", sourceFilename: "rooftop.png" },
        { label: null, imageRole: "reference", sourceFilename: "night.png" },
      ],
      currentPrompt: { shotPrompt: "An existing draft that generate mode still surfaces." },
    };
    const expected = buildShotPromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotPromptFromContextPrompt for generate mode, minimal context", () => {
    const fixture: Fixture = {
      mode: "generate",
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      seq: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null },
      shot: {
        title: "Untitled Shot",
        shotCode: null,
        description: null,
        actionPitch: null,
        cameraPitch: null,
        framing: null,
        cameraMovement: null,
        durationSeconds: null,
      },
      cast: [],
      references: [],
      currentPrompt: { shotPrompt: null },
    };
    const expected = buildShotPromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotPromptFromContextPrompt for enhance mode, complete background context", () => {
    const fixture: Fixture = {
      mode: "enhance",
      project: { name: "Neon Skyline", pitch: "A courier races.", story: "Story.", description: null, outline: null },
      seq: {
        title: "The Chase",
        summary: "A rooftop pursuit.",
        description: "Fast cuts.",
        mood: "Tense",
        locationHint: "Downtown rooftops",
      },
      shot: {
        title: "Rooftop Sprint",
        shotCode: "S12",
        description: "The courier leaps between buildings.",
        actionPitch: null,
        cameraPitch: null,
        framing: null,
        cameraMovement: null,
        durationSeconds: null,
      },
      cast: [],
      references: [],
      currentPrompt: { shotPrompt: "The courier sprints across rain-slicked rooftops at night." },
    };
    const expected = buildShotPromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotPromptFromContextPrompt for shorten mode, no background context, empty current prompt", () => {
    const fixture: Fixture = {
      mode: "shorten",
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      seq: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null },
      shot: {
        title: "Untitled Shot",
        shotCode: null,
        description: null,
        actionPitch: null,
        cameraPitch: null,
        framing: null,
        cameraMovement: null,
        durationSeconds: null,
      },
      cast: [],
      references: [],
      currentPrompt: { shotPrompt: null },
    };
    const expected = buildShotPromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
