import { describe, expect, it } from "vitest";
import { outlineGenerateDescriptor, renderOutlineTargetSectionsBullet } from "@/lib/llmWorkspace/descriptors/outline";
import { renderProjectIdentityOutlineContextLines, type ProjectIdentityData } from "@/lib/llmWorkspace/variables/registry";
import { buildOutlineFromStoryPrompt } from "@/lib/prompts/outline-from-story";
import { assembleDescriptorMessages } from "./helpers/assembleDescriptor";

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
    const expected = buildOutlineFromStoryPrompt({
      name: project.name,
      pitch: project.pitch,
      story: project.story,
      targetSections,
    });
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
    const expected = buildOutlineFromStoryPrompt({
      name: project.name,
      pitch: project.pitch,
      story: project.story,
    });
    const assembled = assemble(project, undefined);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
