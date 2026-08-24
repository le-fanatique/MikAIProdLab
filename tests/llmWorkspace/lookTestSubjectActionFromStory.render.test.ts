import { describe, expect, it } from "vitest";
import { lookTestSubjectActionFromStoryDescriptor } from "@/lib/llmWorkspace/descriptors/lookTestSubjectActionFromStory";
import {
  renderProjectIdentityLookTestStoryLines,
  renderProjectOutlineSectionsLookTestLines,
  type ProjectIdentityData,
} from "@/lib/llmWorkspace/variables/registry";
import type { OutlineSection } from "@/lib/prompts/sequences-from-outline";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// LOOK.FROMSTORY.LLM.1 — render proof for `lookTest.subjectActionFromStory`.
// No oracle to reproduce (`deriveFromStoryText` was deterministic select-and-
// cut, not a prompt) — modelled on `narrativePrompt.compose`'s own render
// test for a new, non-migrated operation: assembled prompt with story +
// outline, with story alone, with outline alone, and the mandatory system
// rules always present.
// ---------------------------------------------------------------------------

function assemble(project: ProjectIdentityData, sections: OutlineSection[]) {
  return assembleDescriptorMessages(lookTestSubjectActionFromStoryDescriptor, (variableId, render) => {
    if (variableId === "PROJECT.IDENTITY" && render === "lookTest.storyLines") {
      return renderProjectIdentityLookTestStoryLines(project);
    }
    if (variableId === "PROJECT.OUTLINE_SECTIONS" && render === "lookTest.outlineLines") {
      return renderProjectOutlineSectionsLookTestLines(sections);
    }
    throw new Error(`unexpected variable block ${variableId}::${render}`);
  });
}

const PROJECT_WITH_STORY: ProjectIdentityData = {
  name: "Neon Skyline",
  pitch: "A courier races across a rain-soaked megacity.",
  story: "Kai, a rooftop courier, discovers a corporate conspiracy and must outrun drones across the neon skyline to expose it.",
  description: null,
  outline: null,
};

const PROJECT_NO_STORY: ProjectIdentityData = {
  name: "Bare Skyline",
  pitch: "A pitch, unused by this operation.",
  story: null,
  description: null,
  outline: null,
};

const SECTIONS: OutlineSection[] = [
  { title: "Opening — The Package", body: "Kai receives a mysterious package on the rooftops at dawn." },
  { title: "The Chase", body: "Corporate drones pursue Kai across the skyline." },
];

describe("lookTest.subjectActionFromStory descriptor — shape", () => {
  it("anchors on project, and declares exactly PROJECT.IDENTITY and PROJECT.OUTLINE_SECTIONS, both userAdjustable: false", () => {
    expect(lookTestSubjectActionFromStoryDescriptor.anchor).toEqual({ kind: "entity", entity: "project" });
    expect(lookTestSubjectActionFromStoryDescriptor.context.variables).toEqual([
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.OUTLINE_SECTIONS", userAdjustable: false },
    ]);
  });

  it("declares intent: {} — no director's note in this ticket", () => {
    expect(lookTestSubjectActionFromStoryDescriptor.intent).toEqual({});
  });

  it("declares the story-or-outline precondition", () => {
    expect(lookTestSubjectActionFromStoryDescriptor.preconditions).toEqual([
      {
        refs: [{ anchorField: "story" }, { variable: "PROJECT.OUTLINE_SECTIONS" }],
        require: "any",
        message: "Add a story or an outline to this project before generating a subject and action from it.",
      },
    ]);
  });

  it("output declares kind: \"object\", two required string fields, and commit: [] — the operation writes nothing", () => {
    expect(lookTestSubjectActionFromStoryDescriptor.output.kind).toBe("object");
    if (lookTestSubjectActionFromStoryDescriptor.output.kind !== "object") throw new Error("unreachable");
    expect(lookTestSubjectActionFromStoryDescriptor.output.fields.map((f) => f.field)).toEqual(["subject", "action"]);
    expect(lookTestSubjectActionFromStoryDescriptor.output.require).toBe("all");
    expect(lookTestSubjectActionFromStoryDescriptor.commit).toEqual([]);
  });
});

describe("lookTest.subjectActionFromStory descriptor — assembled prompt", () => {
  it("with both story and outline sections: the assembled user prompt carries the project name, the story, and every outline section", () => {
    const assembled = assemble(PROJECT_WITH_STORY, SECTIONS);
    expect(assembled.user).toContain("Project: Neon Skyline");
    expect(assembled.user).toContain(
      "Story:\nKai, a rooftop courier, discovers a corporate conspiracy and must outrun drones across the neon skyline to expose it."
    );
    expect(assembled.user).toContain("## Opening — The Package");
    expect(assembled.user).toContain("Kai receives a mysterious package on the rooftops at dawn.");
    expect(assembled.user).toContain("## The Chase");
    // Never the pitch — this operation reads story + outline only, per the
    // ticket's own instruction.
    expect(assembled.user).not.toContain("A courier races across a rain-soaked megacity.");
  });

  it("with story alone (no outline sections): the outline block is absent, and no dangling header remains", () => {
    const assembled = assemble(PROJECT_WITH_STORY, []);
    expect(assembled.user).toContain("Story:");
    expect(assembled.user).not.toContain("Outline:");
  });

  it("with outline sections alone (no story): the Story line is absent, and the outline still renders in full", () => {
    const assembled = assemble(PROJECT_NO_STORY, SECTIONS);
    expect(assembled.user).not.toContain("Story:");
    expect(assembled.user).toContain("Outline:");
    expect(assembled.user).toContain("## The Chase");
  });

  it("the system message states the rewrite (never copy pitch/name), the single-shot action rule, the ~25-word budget, the render-test framing, the no-style-term rule, and forbids markdown", () => {
    const assembled = assemble(PROJECT_WITH_STORY, SECTIONS);
    expect(assembled.system).toMatch(/never copy the pitch or the project name verbatim/);
    expect(assembled.system).toMatch(/playable in a single shot/);
    expect(assembled.system).toMatch(/about 25 words/);
    expect(assembled.system).toMatch(/render test, not a retelling/);
    expect(assembled.system).toMatch(/Never name a visual style, an artist, or a brand/);
    expect(assembled.system).toContain("Always respond with a valid JSON object matching exactly this schema:");
    expect(assembled.system).not.toContain("```");
  });
});
