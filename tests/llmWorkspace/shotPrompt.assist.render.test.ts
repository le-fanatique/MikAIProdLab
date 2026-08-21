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
    const expected = { system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Write a clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A long story text.A lo
Sequence: The Chase
Sequence summary: A rooftop pursuit.
Sequence description: Fast cuts, neon reflections.
Mood: Tense
Location: Downtown rooftops
Shot: S12 — Rooftop Sprint
Duration: 4s
Description: The courier leaps between buildings.
Action: Sprinting, leaping.
Camera intent: Low tracking shot.
Framing: Wide
Camera movement: Tracking
Cast: Courier (character: Weathered jacket.; Protagonist.), Drone (prop)
References: Rooftop ref, night.png
Existing prompt draft: An existing draft that generate mode still surfaces.

Write a visual generation prompt for this shot.` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotPromptFromContextPrompt for generate mode, minimal context", () => {
    const fixture: Fixture = {
      mode: "generate",
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
      cast: [],
      references: [],
      currentPrompt: { shotPrompt: null },
    };
    const expected = { system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Write a clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`, user: `Project: Untitled Project
Sequence: Untitled Sequence
Shot: Untitled Shot

Write a visual generation prompt for this shot.` };
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
        narrativePurpose: null,
      },
      shot: {
        title: "Rooftop Sprint",
        shotCode: "S12",
        description: "The courier leaps between buildings.",
        actionPitch: null,
        cameraSubject: null,
        framing: null,
        cameraMovement: null,
        durationSeconds: null,
      },
      cast: [],
      references: [],
      currentPrompt: { shotPrompt: "The courier sprints across rain-slicked rooftops at night." },
    };
    const expected = { system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Enhance the existing visual prompt by adding detail: camera angle precision, lighting nuances, atmospheric quality, compositional elements. Preserve the original intent and action. Do not change the core subject or scene dramatically.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`, user: `Current prompt:
The courier sprints across rain-slicked rooftops at night.

Shot context (background only):
Shot: The courier leaps between buildings.
Mood: Tense
Location: Downtown rooftops

Transform the prompt as instructed.` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildShotPromptFromContextPrompt for shorten mode, no background context, empty current prompt", () => {
    const fixture: Fixture = {
      mode: "shorten",
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
      cast: [],
      references: [],
      currentPrompt: { shotPrompt: null },
    };
    const expected = { system: `You are an expert at writing visual generation prompts for AI image and video diffusion models.
Compress the existing visual prompt into a shorter, more focused version. Keep the most essential visual elements: subject, action, key composition, mood. Remove redundancy and secondary details.
Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`, user: `Current prompt:


Transform the prompt as instructed.` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
