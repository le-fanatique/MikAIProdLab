import { describe, expect, it } from "vitest";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";
import {
  renderProjectIdentitySequencePromptGenerateLines,
  renderSeqContextSequencePromptGenerateLines,
  renderSeqCurrentPromptTransformBlock,
  renderSequencePromptGenerateSystemBody,
  renderSequencePromptTransformSystemBody,
  renderSequencePromptClosingLine,
  type ProjectIdentityData,
  type SeqContextData,
  type SeqCurrentPromptData,
  type SequencePromptAssistModeId,
} from "@/lib/llmWorkspace/variables/registry";
import {
  buildSequencePromptFromContextPrompt,
  type BuildSequencePromptFromContextInput,
} from "@/lib/prompts/sequence-prompt-from-context";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `sequencePromptAssistDescriptor`'s blocks must equal, byte-for-byte, what
// `buildSequencePromptFromContextPrompt` produces for the same input. Four
// entries, not two: the mode branch (generate vs. transform) reads
// different variables entirely, so "complete" and "minimal" are exercised
// on both sides of that branch.
// ---------------------------------------------------------------------------

type Fixture = {
  mode: SequencePromptAssistModeId;
  project: ProjectIdentityData;
  seq: SeqContextData;
  currentPrompt: SeqCurrentPromptData;
};

function assemble(fixture: Fixture) {
  return assembleDescriptorMessages(
    sequencePromptAssistDescriptor,
    (variableId, render) => {
      switch (`${variableId}::${render}`) {
        case "PROJECT.IDENTITY::sequencePrompt.generateProjectLines":
          return renderProjectIdentitySequencePromptGenerateLines(fixture.project, fixture.mode);
        case "SEQ.CONTEXT::sequencePrompt.generateSequenceLines":
          return renderSeqContextSequencePromptGenerateLines(fixture.seq, fixture.mode);
        default:
          throw new Error(`unexpected block ${variableId}::${render}`);
      }
    },
    undefined, // no `{parameter}` block on this descriptor
    (render) => {
      switch (render) {
        case "sequencePrompt.generateSystemBody":
          return renderSequencePromptGenerateSystemBody(fixture.mode);
        case "sequencePrompt.transformSystemBody":
          return renderSequencePromptTransformSystemBody(fixture.mode);
        case "sequencePrompt.closingLine":
          return renderSequencePromptClosingLine(fixture.mode);
        default:
          throw new Error(`unexpected mode render ${render}`);
      }
    },
    (variableIds, render) => {
      if (
        variableIds.join(",") === "SEQ.CURRENT_PROMPT,SEQ.CONTEXT" &&
        render === "sequencePrompt.transformBlock"
      ) {
        return renderSeqCurrentPromptTransformBlock(fixture.currentPrompt, fixture.seq, fixture.mode);
      }
      throw new Error(`unexpected variables block ${variableIds.join(",")}::${render}`);
    }
  );
}

function toBuilderInput(fixture: Fixture): BuildSequencePromptFromContextInput {
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
    currentSequencePrompt: fixture.currentPrompt.sequencePrompt,
  };
}

describe("sequencePrompt.assist descriptor — strict prompt equality", () => {
  it("matches buildSequencePromptFromContextPrompt for generate mode, complete context", () => {
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
        narrativePurpose: null,
      },
      currentPrompt: { sequencePrompt: "An existing prompt that generate mode ignores." },
    };
    const expected = buildSequencePromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildSequencePromptFromContextPrompt for generate mode, minimal context", () => {
    const fixture: Fixture = {
      mode: "generate",
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      seq: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null, narrativePurpose: null },
      currentPrompt: { sequencePrompt: null },
    };
    const expected = buildSequencePromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildSequencePromptFromContextPrompt for enhance mode, complete background context", () => {
    const fixture: Fixture = {
      mode: "enhance",
      project: { name: "Neon Skyline", pitch: "A courier races.", story: "Story.", description: null, outline: null },
      seq: {
        title: "The Chase",
        summary: "A rooftop pursuit.",
        description: "Fast cuts.",
        mood: "Tense",
        locationHint: "Downtown rooftops",
        narrativePurpose: null,
      },
      currentPrompt: { sequencePrompt: "A courier sprints across rain-slicked rooftops at night." },
    };
    const expected = buildSequencePromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildSequencePromptFromContextPrompt for rewrite mode, no background context, empty current prompt", () => {
    const fixture: Fixture = {
      mode: "rewrite",
      project: { name: "Untitled Project", pitch: null, story: null, description: null, outline: null },
      seq: { title: "Untitled Sequence", summary: null, description: null, mood: null, locationHint: null, narrativePurpose: null },
      currentPrompt: { sequencePrompt: null },
    };
    const expected = buildSequencePromptFromContextPrompt(toBuilderInput(fixture));
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
