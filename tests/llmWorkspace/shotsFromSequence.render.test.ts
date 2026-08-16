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
  type VariableParameterRenderInput,
} from "@/lib/llmWorkspace/variables/registry";
import type { VariableId } from "@/lib/llmWorkspace/types";
import { buildShotsFromSequencePrompt } from "@/lib/prompts/shots-from-sequence";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket (§3): assembling {system, user} from
// `shotsFromSequenceDescriptor`'s blocks must equal, byte-for-byte, what
// `buildShotsFromSequencePrompt` produces for the same input.
//
// The dispatcher below builds the same `VariableParameterRenderInput` object
// the real `runner.ts` dispatch (`buildVariableParameterDispatcher`) builds
// — subsetting the resolved variables and parameters down to what each block
// actually declares — so this level-1 proof exercises the render forms'
// real (post-B7c-n4) calling convention, not a hand-threaded stand-in.
// `tests/llmWorkspace/shotsFromSequence.runner.test.ts` is the level-2 proof
// that the real runner dispatch produces the same result end to end.
// ---------------------------------------------------------------------------

function assemble(
  project: ProjectIdentityData,
  seq: SeqContextData,
  currentPrompt: SeqCurrentPromptData,
  targetCount: number | undefined
) {
  const allVariables: Partial<Record<VariableId, unknown>> = {
    "PROJECT.IDENTITY": project,
    "SEQ.CONTEXT": seq,
    "SEQ.CURRENT_PROMPT": currentPrompt,
  };
  const allParameters: Record<string, number | string | undefined> = { targetCount };

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
      throw new Error(`unexpected multi-variable block ${variableIds.join(",")}::${render}`);
    },
    undefined,
    (variableIds, parameterIds, render) => {
      const variables: Partial<Record<VariableId, unknown>> = {};
      for (const id of variableIds) variables[id] = allVariables[id];
      const parameters: Record<string, number | string | undefined> = {};
      for (const id of parameterIds) parameters[id] = allParameters[id];
      const input: VariableParameterRenderInput = { variables, parameters, mode: undefined };

      if (render === "shotsFromSequence.systemPathABody") return renderShotsFromSequenceSystemPathABody(input);
      if (render === "shotsFromSequence.systemPathBBody") return renderShotsFromSequenceSystemPathBBody(input);
      if (render === "shotsFromSequence.templatePathA") return renderShotsFromSequenceTemplatePathA(input);
      if (render === "shotsFromSequence.templatePathB") return renderShotsFromSequenceTemplatePathB(input);
      throw new Error(`unexpected variables-parameters block ${variableIds.join(",")}/${parameterIds.join(",")}::${render}`);
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
