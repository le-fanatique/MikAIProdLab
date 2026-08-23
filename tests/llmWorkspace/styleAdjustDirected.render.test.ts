import { describe, expect, it } from "vitest";
import { styleAdjustDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/styleAdjustDirected";
import {
  renderProjectStyleDraftLines,
  renderStyleAdjustDirectorNoteLine,
  renderStyleAdjustDirectorRuleLine,
  renderStyleAdjustProjectLines,
  type ProjectIdentityData,
  type ProjectStyleDraftData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// STYLE.LLM.ADJUST.CORE.1 — render proof for `style.adjustDirected`, on the
// model of `shotLightingDirected.render.test.ts` /
// `sequenceLightingDirected.render.test.ts` (both descriptors with no
// flat-JSON oracle to reproduce byte-for-byte, per this ticket's own §3).
// The proof that matters most for this ticket ("Preuve exigée"): the
// assembled prompt stays coherent both with a filled Working Draft and with
// `mode: "none"`, and the director's note block disappears entirely — no
// dangling "direction below" reference — when the note is blank.
// ---------------------------------------------------------------------------

function assemble(project: ProjectIdentityData, draft: ProjectStyleDraftData, freeText: string | undefined) {
  return assembleDescriptorMessages(
    styleAdjustDirectedDescriptor,
    (variableId, render) => {
      if (variableId === "PROJECT.IDENTITY" && render === "styleAdjust.projectLines") {
        return renderStyleAdjustProjectLines(project);
      }
      if (variableId === "PROJECT.STYLE.DRAFT" && render === "styleAdjust.draftLines") {
        return renderProjectStyleDraftLines(draft);
      }
      throw new Error(`unexpected variable block ${variableId}::${render}`);
    },
    undefined,
    undefined,
    undefined,
    (render) => {
      if (render === "styleAdjust.directorNoteLine") return renderStyleAdjustDirectorNoteLine(freeText);
      if (render === "styleAdjust.directorRuleLine") return renderStyleAdjustDirectorRuleLine(freeText);
      throw new Error(`unexpected freeText render form ${render}`);
    }
  );
}

const PROJECT: ProjectIdentityData = { name: "Neon Skyline", pitch: null, story: null, description: null, outline: null };

const FILLED_DRAFT: ProjectStyleDraftData = {
  mode: "draft",
  revision: 3,
  directionBrief: "Painted, painterly rendering, no clichéd blue skies.",
  compiledText: "World:\n- A rain-soaked megacity.\n\nVisual:\n- Painterly rendering with visible brush texture.",
};

const NONE_DRAFT: ProjectStyleDraftData = { mode: "none" };

describe("style.adjustDirected descriptor — shape", () => {
  it("anchors on project, and declares exactly PROJECT.IDENTITY and PROJECT.STYLE.DRAFT, both userAdjustable: false", () => {
    expect(styleAdjustDirectedDescriptor.anchor).toEqual({ kind: "entity", entity: "project" });
    expect(styleAdjustDirectedDescriptor.context.variables).toEqual([
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.STYLE.DRAFT", userAdjustable: false },
    ]);
  });

  it("declares intent.freeText — one director's-note consigne, no mode, no parameter", () => {
    expect(styleAdjustDirectedDescriptor.intent).toEqual({ freeText: { label: "Director's note" } });
  });

  it("declares no preconditions — an empty Working Draft is a normal state, not a refusal", () => {
    expect(styleAdjustDirectedDescriptor.preconditions).toBeUndefined();
  });

  it("output declares kind: \"list\", arrayKey rules, item.validity on instruction alone, and commits through addRuleAction alone", () => {
    expect(styleAdjustDirectedDescriptor.output.kind).toBe("list");
    if (styleAdjustDirectedDescriptor.output.kind !== "list") throw new Error("unreachable");
    expect(styleAdjustDirectedDescriptor.output.arrayKey).toBe("rules");
    expect(styleAdjustDirectedDescriptor.output.item.validity).toEqual({ fields: ["instruction"], require: "all" });
    expect(styleAdjustDirectedDescriptor.output.item.fields.map((f) => f.field)).toEqual([
      "instruction",
      "pillar",
      "section",
      "category",
      "strength",
      "applicability",
      "provenanceNotes",
    ]);
    expect(styleAdjustDirectedDescriptor.commit).toEqual(["addRuleAction"]);
  });

  it("declares commitAdvisory: an added rule lives in the Working Draft and affects no generation until publish", () => {
    expect(styleAdjustDirectedDescriptor.commitAdvisory).toBe(
      "A rule added here lives in the Working Draft and affects no generation until the author publishes a new Style version."
    );
  });
});

describe("style.adjustDirected descriptor — assembled prompt", () => {
  it("with a filled Working Draft and a director's note, the assembled user prompt carries both", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, "more painted, visible textures, no blue skies");
    expect(assembled.user).toContain("Project: Neon Skyline");
    expect(assembled.user).toContain("Direction brief: Painted, painterly rendering, no clichéd blue skies.");
    expect(assembled.user).toContain("Painterly rendering with visible brush texture.");
    expect(assembled.user).toContain("Director's note: more painted, visible textures, no blue skies");
  });

  it("with mode: \"none\" (no Working Draft yet), the prompt stays coherent — the variable block leaves no gap", () => {
    const assembled = assemble(PROJECT, NONE_DRAFT, "start with a painterly look");
    expect(assembled.user).toContain("Project: Neon Skyline");
    expect(assembled.user).toContain("No Working Draft exists yet for this project.");
    expect(assembled.user).toContain("Director's note: start with a painterly look");
  });

  it("with an empty note, the freeText block disappears entirely — no dangling 'direction below' reference", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, undefined);
    expect(assembled.user).not.toMatch(/Director's note/);
    expect(assembled.system).not.toMatch(/Respond to the director's note/);
    expect(assembled.system).not.toMatch(/direction below/);
  });

  it("with a note, the system carries the conditional rule to respond to it", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, "more painted");
    expect(assembled.system).toContain(
      "- Respond to the director's note below: propose only the rules it asks for, never a rewrite of the existing Working Draft."
    );
  });

  it("the system message frames the task, states the pillar/strength/JSON rules, and forbids markdown", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, undefined);
    expect(assembled.system).toContain("art director");
    expect(assembled.system).toMatch(/atomic instruction, applicable and checkable/);
    expect(assembled.system).toMatch(/exactly one pillar/);
    expect(assembled.system).toMatch(/"Avoid"/);
    expect(assembled.system).toContain("Always respond with a valid JSON object matching exactly this schema:");
    expect(assembled.system).not.toContain("```");
  });
});
