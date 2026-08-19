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
//
// LLMW.C0.REANCHOR.1 — each `expected` below is a frozen literal captured
// from `buildSequencesFromOutlinePrompt` for this exact fixture, not a live
// call to the builder: comparing the descriptor's output to the builder's
// output would no longer prove anything once the builder is deleted
// (C1/C2/C3). `parseOutlineSections` stays imported: it is real production
// dispatch logic used to build the input `assemble()` needs, not an oracle.
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
  targetCount: number | undefined,
  expected: { system: string; user: string }
) {
  const sections = project.outline?.trim() ? parseOutlineSections(project.outline) : [];

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
      undefined,
      { system: `You are a professional film production designer and story structure expert.
The project outline is not yet available. Generate production sequences from the project pitch and story instead.
Choose a natural number of sequences based on the story structure (typically 4 to 8).

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here.

Break this project into production sequences.` }
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
      5,
      { system: `You are a professional film production designer and story structure expert.
The project outline is not yet available. Generate production sequences from the project pitch and story instead.
Produce exactly 5 sequences.

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.
Story: Full story text goes here.

Break this project into production sequences.` }
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
      3,
      { system: `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- Produce exactly 3 sequences. When grouping sections: concatenate or lightly condense their bodies for \`summary\`. When splitting: use the relevant portion of the source body.

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Neon Skyline

Background context (do not override the outline):
Pitch: A courier races across a rain-soaked megacity.
Story (background only): Full story text goes here.

Outline sections (primary source):

Section 01
Title (copy verbatim into "title"): Opening
Body (copy verbatim into "summary"): The courier receives the package.

Section 02
Title (copy verbatim into "title"): Chase
Body (copy verbatim into "summary"): A rooftop pursuit begins.

For each section: set \`title\` = the Title above, set \`summary\` = the Body above verbatim. Infer \`description\`, \`narrative_purpose\`, \`mood\`, and \`location_hint\` from the section body. Do not paraphrase the summary.` }
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
      undefined,
      { system: `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- The outline contains 2 sections. Generate exactly 2 sequences, one per "## " section. Do not merge or split sections.

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Neon Skyline

Background context (do not override the outline):
Pitch: A courier races across a rain-soaked megacity.
Story (background only): Full story text goes here.

Outline sections (primary source):

Section 01
Title (copy verbatim into "title"): Opening
Body (copy verbatim into "summary"): The courier receives the package.

Section 02
Title (copy verbatim into "title"): Chase
Body (copy verbatim into "summary"): A rooftop pursuit begins.

For each section: set \`title\` = the Title above, set \`summary\` = the Body above verbatim. Infer \`description\`, \`narrative_purpose\`, \`mood\`, and \`location_hint\` from the section body. Do not paraphrase the summary.` }
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
      undefined,
      { system: `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- Produce one sequence per ## section in the outline. Do not merge or split sections.

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Neon Skyline

Project Outline (primary source — map this into sequences):
A loose paragraph of notes with no ## headers at all.

For each "## " section: set \`title\` = the header text without "## ", set \`summary\` = the section body verbatim. Do not paraphrase the summary.` }
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
      7,
      { system: `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- Produce exactly 7 sequences. When grouping sections: concatenate or lightly condense their bodies for \`summary\`. When splitting: use the relevant portion of the source body.

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Neon Skyline

Project Outline (primary source — map this into sequences):
A loose paragraph of notes with no ## headers at all.

For each "## " section: set \`title\` = the header text without "## ", set \`summary\` = the section body verbatim. Do not paraphrase the summary.` }
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
      undefined,
      { system: `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- The outline contains 1 sections. Generate exactly 1 sequences, one per "## " section. Do not merge or split sections.

Always respond with a valid JSON object matching exactly this schema:
{
  "sequences": [
    {
      "title": "string — the section header text, verbatim (without the ## prefix)",
      "summary": "string or null — the section body text, verbatim. Do not paraphrase or shorten.",
      "description": "string or null — enriched production narrative inferred from the section",
      "narrative_purpose": "string or null — dramatic function in the arc (e.g. Opening, Inciting incident, Climax, Resolution)",
      "mood": "string or null — emotional tone (e.g. tense, melancholic, frenetic, serene)",
      "location_hint": "string or null — setting or location useful for production (e.g. Exterior rooftop / night)",
      "order_index": number (starting at 0)
    }
  ]
}
No markdown. No explanation. No text before or after. Only the JSON object.`, user: `Project: Untitled Project

Outline sections (primary source):

Section 01
Title (copy verbatim into "title"): Only section
Body (copy verbatim into "summary"): Just one body.

For each section: set \`title\` = the Title above, set \`summary\` = the Body above verbatim. Infer \`description\`, \`narrative_purpose\`, \`mood\`, and \`location_hint\` from the section body. Do not paraphrase the summary.` }
    );
  });
});
