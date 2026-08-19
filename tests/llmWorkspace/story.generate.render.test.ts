import { describe, expect, it } from "vitest";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";
import { renderProjectIdentityStoryContextLines, type ProjectIdentityData } from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket's single obligation: assembling {system,
// user} from `storyGenerateDescriptor`'s blocks must equal, byte-for-byte
// (`toBe`), what `buildStoryFromPitchPrompt` produces for the same input.
// Two entries: complete (pitch + description set) and minimal (both null,
// which is where `buildStoryFromPitchPrompt`'s fixed placeholders live).
// The builder is pure — no database, handcrafted input only.
// ---------------------------------------------------------------------------

function assemble(project: ProjectIdentityData) {
  return assembleDescriptorMessages(storyGenerateDescriptor, (variableId, render) => {
    if (variableId === "PROJECT.IDENTITY" && render === "story.contextLines") {
      return renderProjectIdentityStoryContextLines(project);
    }
    throw new Error(`unexpected block ${variableId}::${render}`);
  });
}

describe("story.generate descriptor — strict prompt equality", () => {
  it("matches buildStoryFromPitchPrompt for a complete project", () => {
    const project: ProjectIdentityData = {
      name: "Neon Skyline",
      pitch: "A courier races across a rain-soaked megacity.",
      story: null,
      description: "Cyberpunk tone, practical lighting.",
      outline: null,
    };
    const expected = { system: `You are a professional screenwriter and narrative consultant.
Your task is to write a concise story synopsis from a project pitch.
The story should be 200 to 400 words, written in a cinematic style suitable for production use.
Always respond with a valid JSON object matching exactly this schema:
{ "story": "<narrative text>" }
No markdown. No explanation. Only the JSON object.`, user: `Project title: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Additional notes: Cyberpunk tone, practical lighting.

Write a story synopsis for this project.` };
    const assembled = assemble(project);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildStoryFromPitchPrompt for a minimal project (no pitch, no description)", () => {
    const project: ProjectIdentityData = {
      name: "Untitled Project",
      pitch: null,
      story: null,
      description: null,
      outline: null,
    };
    const expected = { system: `You are a professional screenwriter and narrative consultant.
Your task is to write a concise story synopsis from a project pitch.
The story should be 200 to 400 words, written in a cinematic style suitable for production use.
Always respond with a valid JSON object matching exactly this schema:
{ "story": "<narrative text>" }
No markdown. No explanation. Only the JSON object.`, user: `Project title: Untitled Project
Pitch: Not provided
Additional notes: None

Write a story synopsis for this project.` };
    const assembled = assemble(project);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
