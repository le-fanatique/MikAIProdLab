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
    const expected = { system: `You are an expert at writing visual and narrative direction prompts for film sequences.
Write a Sequence Prompt that describes the visual atmosphere, dramatic arc, camera approach, lighting, setting, and mood of the sequence.
Focus on: what is felt and seen across the sequence as a whole. Do not list individual shots.
Do not mention project names or sequence names explicitly in the prompt.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one or two paragraphs maximum.
Always respond with a valid JSON object matching exactly this schema:
{ "sequence_prompt": "<your sequence prompt here>" }
No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A lo
Sequence: The Chase
Summary: A rooftop pursuit.
Description: Fast cuts, neon reflections.
Mood: Tense
Location: Downtown rooftops

Write a sequence prompt for this sequence.` };
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
    const expected = { system: `You are an expert at writing visual and narrative direction prompts for film sequences.
Write a Sequence Prompt that describes the visual atmosphere, dramatic arc, camera approach, lighting, setting, and mood of the sequence.
Focus on: what is felt and seen across the sequence as a whole. Do not list individual shots.
Do not mention project names or sequence names explicitly in the prompt.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one or two paragraphs maximum.
Always respond with a valid JSON object matching exactly this schema:
{ "sequence_prompt": "<your sequence prompt here>" }
No explanation. Only the JSON object.`, user: `Project: Untitled Project
Sequence: Untitled Sequence

Write a sequence prompt for this sequence.` };
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
    const expected = { system: `You are an expert at writing visual and narrative direction prompts for film sequences.
Enhance the existing sequence prompt by adding visual and narrative detail: atmosphere, lighting quality, camera approach, dramatic arc. Preserve the original intent. Do not change the core subject or setting dramatically.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one or two paragraphs maximum.
Always respond with a valid JSON object matching exactly this schema:
{ "sequence_prompt": "<your sequence prompt here>" }
No explanation. Only the JSON object.`, user: `Current prompt:
A courier sprints across rain-slicked rooftops at night.

Sequence context (background only):
Mood: Tense
Location: Downtown rooftops
Summary: A rooftop pursuit.

Transform the prompt as instructed.` };
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
    const expected = { system: `You are an expert at writing visual and narrative direction prompts for film sequences.
Rewrite the existing sequence prompt to be cleaner, more cinematic, and more evocative. Preserve the meaning and intent. Remove awkward phrasing. Make it flow naturally as a visual and narrative description.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one or two paragraphs maximum.
Always respond with a valid JSON object matching exactly this schema:
{ "sequence_prompt": "<your sequence prompt here>" }
No explanation. Only the JSON object.`, user: `Current prompt:


Transform the prompt as instructed.` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
