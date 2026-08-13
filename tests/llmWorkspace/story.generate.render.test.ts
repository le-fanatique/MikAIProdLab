import { describe, expect, it } from "vitest";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";
import { renderProjectIdentityStoryContextLines, type ProjectIdentityData } from "@/lib/llmWorkspace/variables/registry";
import { buildStoryFromPitchPrompt } from "@/lib/prompts/story-from-pitch";
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
    const expected = buildStoryFromPitchPrompt({
      name: project.name,
      pitch: project.pitch,
      description: project.description,
    });
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
    const expected = buildStoryFromPitchPrompt({
      name: project.name,
      pitch: project.pitch,
      description: project.description,
    });
    const assembled = assemble(project);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
