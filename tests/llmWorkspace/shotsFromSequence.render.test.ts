import { describe, expect, it } from "vitest";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import {
  renderShotsFromSequenceJsonSchemaBlock,
  renderShotsFromSequenceSystemPathABody,
  renderShotsFromSequenceSystemPathBBody,
  renderShotsFromSequenceTemplatePathA,
  renderShotsFromSequenceTemplatePathB,
  type ProjectIdentityData,
  type SeqContextData,
  type SeqCurrentPromptData,
} from "@/lib/llmWorkspace/variables/registry";
import { buildShotsFromSequencePrompt } from "@/lib/prompts/shots-from-sequence";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket (§3): assembling {system, user} from
// `shotsFromSequenceDescriptor`'s blocks must equal, byte-for-byte, what
// `buildShotsFromSequencePrompt` produces for the same input.
//
// The dispatcher below threads `targetCount` into the Path-selecting
// multi-variable render forms directly via closure, the same way the
// production `runner.ts` cannot yet (see `descriptors/shotsFromSequence.ts`'s
// header comment and `.agents/executor_report.md`) — this proves the
// descriptor's render forms produce the right text for a given input, not
// that `runner.ts`'s generic dispatch can supply that input today.
// ---------------------------------------------------------------------------

function assemble(
  project: ProjectIdentityData,
  seq: SeqContextData,
  currentPrompt: SeqCurrentPromptData,
  targetCount: number | undefined
) {
  return assembleDescriptorMessages(
    shotsFromSequenceDescriptor,
    (variableId, render) => {
      throw new Error(`unexpected single-variable block ${variableId}::${render}`);
    },
    (parameterId, render) => {
      if (parameterId === "targetCount" && render === "shotsFromSequence.jsonSchemaBlock") {
        return renderShotsFromSequenceJsonSchemaBlock(targetCount);
      }
      throw new Error(`unexpected parameter block ${parameterId}::${render}`);
    },
    undefined,
    (variableIds, render) => {
      if (render === "shotsFromSequence.systemPathABody") {
        return renderShotsFromSequenceSystemPathABody(currentPrompt, targetCount);
      }
      if (render === "shotsFromSequence.systemPathBBody") {
        return renderShotsFromSequenceSystemPathBBody(currentPrompt, targetCount);
      }
      if (render === "shotsFromSequence.templatePathA") {
        return renderShotsFromSequenceTemplatePathA(project, seq, currentPrompt, targetCount);
      }
      if (render === "shotsFromSequence.templatePathB") {
        return renderShotsFromSequenceTemplatePathB(project, seq, currentPrompt, targetCount);
      }
      throw new Error(`unexpected multi-variable block ${variableIds.join(",")}::${render}`);
    }
  );
}

describe("shots.fromSequence descriptor — strict prompt equality", () => {
  it("matches buildShotsFromSequencePrompt (Approved Sequence Prompt present, targetCount provided)", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      description: "Internal production notes.",
      outline: "## Opening\nThe courier receives the package.",
    };
    const seq: SeqContextData = {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
    };
    const currentPrompt: SeqCurrentPromptData = {
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    };
    const targetCount = 8;

    const expected = buildShotsFromSequencePrompt({
      project: { name: project.name, pitch: project.pitch, story: project.story, outline: project.outline },
      sequence: {
        title: seq.title,
        summary: seq.summary,
        description: seq.description,
        narrativePurpose: seq.narrativePurpose,
        mood: seq.mood,
        locationHint: seq.locationHint,
        sequencePrompt: currentPrompt.sequencePrompt,
      },
      targetCount,
    });
    const assembled = assemble(project, seq, currentPrompt, targetCount);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotsFromSequencePrompt (Approved Sequence Prompt present, no targetCount)", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      description: "Internal production notes.",
      outline: "## Opening\nThe courier receives the package.",
    };
    const seq: SeqContextData = {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
    };
    const currentPrompt: SeqCurrentPromptData = {
      sequencePrompt: "Neon-lit rooftops, rain, a courier sprinting under chase.",
    };

    const expected = buildShotsFromSequencePrompt({
      project: { name: project.name, pitch: project.pitch, story: project.story, outline: project.outline },
      sequence: {
        title: seq.title,
        summary: seq.summary,
        description: seq.description,
        narrativePurpose: seq.narrativePurpose,
        mood: seq.mood,
        locationHint: seq.locationHint,
        sequencePrompt: currentPrompt.sequencePrompt,
      },
    });
    const assembled = assemble(project, seq, currentPrompt, undefined);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotsFromSequencePrompt (minimal sequence, no Approved Sequence Prompt, minimal project)", () => {
    const project: ProjectIdentityData = {
      name: "Untitled Project",
      pitch: null,
      story: null,
      description: null,
      outline: null,
    };
    const seq: SeqContextData = {
      title: "Sequence",
      summary: null,
      description: null,
      mood: null,
      locationHint: null,
      narrativePurpose: null,
    };
    const currentPrompt: SeqCurrentPromptData = { sequencePrompt: null };
    const targetCount = 4;

    const expected = buildShotsFromSequencePrompt({
      project: { name: project.name, pitch: project.pitch, story: project.story, outline: project.outline },
      sequence: {
        title: seq.title,
        summary: seq.summary,
        description: seq.description,
        narrativePurpose: seq.narrativePurpose,
        mood: seq.mood,
        locationHint: seq.locationHint,
        sequencePrompt: currentPrompt.sequencePrompt,
      },
      targetCount,
    });
    const assembled = assemble(project, seq, currentPrompt, targetCount);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
