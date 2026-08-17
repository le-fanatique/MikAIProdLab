import { describe, expect, it } from "vitest";
import { sequencesFromOutlineDescriptor } from "@/lib/llmWorkspace/descriptors/sequencesFromOutline";
import {
  renderSequencesFromOutlineSystemPathABody,
  renderSequencesFromOutlineSystemPathBBody,
  renderSequencesFromOutlineTemplatePathA,
  renderSequencesFromOutlineTemplatePathB,
  type ProjectIdentityData,
  type VariableParameterRenderInput,
} from "@/lib/llmWorkspace/variables/registry";
import type { VariableId } from "@/lib/llmWorkspace/types";
import { buildSequencesFromOutlinePrompt } from "@/lib/prompts/sequences-from-outline";
import { parseOutlineSections } from "@/lib/prompts/outlineSections";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket (§ "Validation attendue" 1): assembling
// {system, user} from `sequencesFromOutlineDescriptor`'s blocks must equal,
// byte-for-byte, what `buildSequencesFromOutlinePrompt` produces for the
// same input, across the builder's own branch matrix (outline present/absent
// x targetCount provided/absent x sections present/absent). Same dispatcher
// discipline as `shotsFromSequence.render.test.ts`: builds the real
// `VariableParameterRenderInput` the production dispatch would build, not a
// hand-threaded stand-in.
// ---------------------------------------------------------------------------

function assemble(project: ProjectIdentityData, sections: ReturnType<typeof parseOutlineSections>, targetCount: number | undefined) {
  const allVariables: Partial<Record<VariableId, unknown>> = {
    "PROJECT.IDENTITY": project,
    "PROJECT.OUTLINE_SECTIONS": sections,
  };
  const allParameters: Record<string, number | string | undefined> = { targetCount };

  return assembleDescriptorMessages(
    sequencesFromOutlineDescriptor,
    (variableId, render) => {
      throw new Error(`unexpected single-variable block ${variableId}::${render}`);
    },
    (parameterId, render) => {
      throw new Error(`unexpected parameter block ${parameterId}::${render}`);
    },
    undefined,
    (variableIds, render) => {
      const args = variableIds.map((id) => allVariables[id]);
      if (render === "sequencesFromOutline.templatePathA") {
        return renderSequencesFromOutlineTemplatePathA(args[0] as ProjectIdentityData, args[1] as ReturnType<typeof parseOutlineSections>);
      }
      if (render === "sequencesFromOutline.templatePathB") {
        return renderSequencesFromOutlineTemplatePathB(args[0] as ProjectIdentityData);
      }
      throw new Error(`unexpected multi-variable block ${variableIds.join(",")}::${render}`);
    },
    undefined,
    (variableIds, parameterIds, render) => {
      const variables: Partial<Record<VariableId, unknown>> = {};
      for (const id of variableIds) variables[id] = allVariables[id];
      const parameters: Record<string, number | string | undefined> = {};
      for (const id of parameterIds) parameters[id] = allParameters[id];
      const input: VariableParameterRenderInput = { variables, parameters, mode: undefined };

      if (render === "sequencesFromOutline.systemPathABody") return renderSequencesFromOutlineSystemPathABody(input);
      if (render === "sequencesFromOutline.systemPathBBody") return renderSequencesFromOutlineSystemPathBBody(input);
      throw new Error(`unexpected variables-parameters block ${variableIds.join(",")}/${parameterIds.join(",")}::${render}`);
    }
  );
}

function expectMatches(
  project: ProjectIdentityData,
  targetCount: number | undefined
) {
  const sections = project.outline?.trim() ? parseOutlineSections(project.outline) : [];
  const sectionCount = sections.length || null;

  const expected = buildSequencesFromOutlinePrompt({
    name: project.name,
    pitch: project.pitch,
    story: project.story,
    outline: project.outline,
    targetCount,
    sectionCount,
    outlineSections: sections.length > 0 ? sections : undefined,
  });
  const assembled = assemble(project, sections, targetCount);
  expect(assembled.system).toBe(expected.system);
  expect(assembled.user).toBe(expected.user);
}

describe("sequences.fromOutline descriptor — strict prompt equality", () => {
  it("Path B (outline absent), targetCount absent", () => {
    expectMatches(
      {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        description: "Internal production notes.",
        outline: null,
      },
      undefined
    );
  });

  it("Path B (outline absent), targetCount provided", () => {
    expectMatches(
      {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        description: "Internal production notes.",
        outline: "",
      },
      5
    );
  });

  it("Path A (outline present, with sections), targetCount provided (overrides sectionCount)", () => {
    expectMatches(
      {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        description: "Internal production notes.",
        outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
      },
      3
    );
  });

  it("Path A (outline present, with sections), targetCount absent (sectionCount known)", () => {
    expectMatches(
      {
        name: "Neon Skyline",
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        description: "Internal production notes.",
        outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
      },
      undefined
    );
  });

  it("Path A (outline present, no parsed sections), targetCount absent (neither known)", () => {
    expectMatches(
      {
        name: "Neon Skyline",
        pitch: null,
        story: null,
        description: null,
        outline: "A loose paragraph of notes with no ## headers at all.",
      },
      undefined
    );
  });

  it("Path A (outline present, no parsed sections), targetCount provided", () => {
    expectMatches(
      {
        name: "Neon Skyline",
        pitch: null,
        story: null,
        description: null,
        outline: "A loose paragraph of notes with no ## headers at all.",
      },
      7
    );
  });

  it("Path A, minimal project (no pitch/story)", () => {
    expectMatches(
      {
        name: "Untitled Project",
        pitch: null,
        story: null,
        description: null,
        outline: "## Only section\nJust one body.",
      },
      undefined
    );
  });
});
