import { describe, expect, it } from "vitest";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";
import {
  renderOutlineTargetSectionsBullet,
  renderProjectIdentityOutlineContextLines,
  type ProjectIdentityData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `outlineGenerateDescriptor`'s blocks must equal, byte-for-byte, what
// `buildOutlineFromStoryPrompt` produces for the same input. Two entries per
// the ticket's explicit instruction for this operation: one with
// `targetSections` provided, one without — the case that reveals the
// mid-system parameter block. The builder is pure, no database.
// ---------------------------------------------------------------------------

function assemble(project: ProjectIdentityData, targetSections: number | undefined) {
  return assembleDescriptorMessages(
    outlineGenerateDescriptor,
    (variableId, render) => {
      if (variableId === "PROJECT.IDENTITY" && render === "outline.projectContextLines") {
        return renderProjectIdentityOutlineContextLines(project);
      }
      throw new Error(`unexpected block ${variableId}::${render}`);
    },
    (parameterId, render) => {
      if (parameterId === "targetSections" && render === "outline.sectionInstructionBullet") {
        return renderOutlineTargetSectionsBullet(targetSections);
      }
      throw new Error(`unexpected parameter block ${parameterId}::${render}`);
    }
  );
}

describe("outline.generate descriptor — strict prompt equality", () => {
  it("matches buildOutlineFromStoryPrompt with targetSections provided", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: "Full story text goes here, several sentences long.",
      description: null,
      outline: null,
    };
    const targetSections = 6;
    const expected = { system: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).
- Write exactly 6 sections.

OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`, user: `Project title: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here, several sentences long.

Write a Project Outline for this project. Each section should clearly define its narrative role and production context.` };
    const assembled = assemble(project, targetSections);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildOutlineFromStoryPrompt without targetSections (minimal project)", () => {
    const project: ProjectIdentityData = {
      name: "Untitled Project",
      pitch: null,
      story: null,
      description: null,
      outline: null,
    };
    const expected = { system: `You are a professional film production supervisor and narrative consultant.
Your task is to write a Project Outline: a structured narrative blueprint for a short film or video project.

FORMAT RULES — follow exactly:
- Each section must start with "## " followed by a short title (e.g. "## Opening — The Arrival").
- Under each section header, write 2 to 4 sentences describing: narrative content, mood, setting or location, dramatic function, and production relevance where useful.
- Do not use any other markdown syntax (no bold, no lists, no sub-headers).
- Sections should map naturally to future production sequences (distinct locations, narrative phases, or dramatic beats).
- Choose a natural number of sections based on the story structure (typically 4 to 8).

OUTPUT RULES:
Always respond with a valid JSON object matching exactly this schema:
{ "outline": "<full outline as a single markdown string with ## headers and paragraph text>" }
No markdown outside the JSON string. No explanation. No text before or after. Only the JSON object.`, user: `Project title: Untitled Project

Write a Project Outline for this project. Each section should clearly define its narrative role and production context.` };
    const assembled = assemble(project, undefined);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
