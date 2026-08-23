import { describe, expect, it } from "vitest";
import { styleAdjustFromLookResultDescriptor } from "@/lib/llmWorkspace/descriptors/styleAdjustFromLookResult";
import {
  renderLookResultLines,
  renderProjectStyleDraftLines,
  renderStyleAdjustDirectorNoteLine,
  renderStyleAdjustDirectorRuleLine,
  renderStyleAdjustProjectLines,
  type LookResultData,
  type ProjectIdentityData,
  type ProjectStyleDraftData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// STYLE.LLM.LOOKFEEDBACK.CORE.1 — render proof for
// `style.adjustFromLookResult`, on the model of
// `styleAdjustDirected.render.test.ts` (its frère, per the ticket): the
// assembled prompt stays coherent both with a filled Working Draft and with
// `mode: "none"`, carries the Look Test result's own lines, and the
// director's note block disappears entirely — no dangling reference — when
// the note is blank.
// ---------------------------------------------------------------------------

function assemble(
  project: ProjectIdentityData,
  draft: ProjectStyleDraftData,
  lookResult: LookResultData,
  freeText: string | undefined
) {
  return assembleDescriptorMessages(
    styleAdjustFromLookResultDescriptor,
    (variableId, render) => {
      if (variableId === "PROJECT.IDENTITY" && render === "styleAdjust.projectLines") {
        return renderStyleAdjustProjectLines(project);
      }
      if (variableId === "PROJECT.STYLE.DRAFT" && render === "styleAdjust.draftLines") {
        return renderProjectStyleDraftLines(draft);
      }
      if (variableId === "LOOK.RESULT" && render === "lookFeedback.resultLines") {
        return renderLookResultLines(lookResult);
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

const RESULT_WITH_NOTES: LookResultData = {
  result: { kind: "image", status: "rejected", notes: "This one leans too photoreal, I want more painted texture." },
  test: {
    mode: "image",
    source: "custom",
    subject: "Hero character, three-quarter view",
    action: "Standing still, looking off-frame",
    styleSourceKind: "working-draft",
    styleCompiledText: "World:\n- A rain-soaked megacity.\n\nVisual:\n- Photorealistic rendering.",
  },
};

const RESULT_LOOK_TARGET: LookResultData = {
  result: { kind: "video", status: "look-target", notes: null },
  test: {
    mode: "video",
    source: "neutral-benchmark",
    subject: "Neutral test subject",
    action: "Neutral test action",
    styleSourceKind: "published-version",
    styleCompiledText: "Visual:\n- Painterly rendering.",
  },
};

describe("style.adjustFromLookResult descriptor — shape", () => {
  it("anchors on lookResult, and declares exactly PROJECT.IDENTITY, PROJECT.STYLE.DRAFT and LOOK.RESULT, all userAdjustable: false", () => {
    expect(styleAdjustFromLookResultDescriptor.anchor).toEqual({ kind: "entity", entity: "lookResult" });
    expect(styleAdjustFromLookResultDescriptor.context.variables).toEqual([
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.STYLE.DRAFT", userAdjustable: false },
      { id: "LOOK.RESULT", userAdjustable: false },
    ]);
  });

  it("declares the lookResult chainNotFound message", () => {
    expect(styleAdjustFromLookResultDescriptor.messages.chainNotFound).toEqual({
      project: "Project not found.",
      lookResult: "Look Test result not found.",
    });
  });

  it("declares intent.freeText — one director's-note consigne, no mode, no parameter", () => {
    expect(styleAdjustFromLookResultDescriptor.intent).toEqual({ freeText: { label: "Director's note" } });
  });

  it("declares no preconditions — an empty Working Draft is a normal state, not a refusal", () => {
    expect(styleAdjustFromLookResultDescriptor.preconditions).toBeUndefined();
  });

  it("output declares kind: \"list\", the same field shape and validity as style.adjustDirected, and commits through addRuleAction alone", () => {
    expect(styleAdjustFromLookResultDescriptor.output.kind).toBe("list");
    if (styleAdjustFromLookResultDescriptor.output.kind !== "list") throw new Error("unreachable");
    expect(styleAdjustFromLookResultDescriptor.output.arrayKey).toBe("rules");
    expect(styleAdjustFromLookResultDescriptor.output.item.validity).toEqual({ fields: ["instruction"], require: "all" });
    expect(styleAdjustFromLookResultDescriptor.output.item.fields.map((f) => f.field)).toEqual([
      "instruction",
      "pillar",
      "section",
      "category",
      "strength",
      "applicability",
      "provenanceNotes",
    ]);
    expect(styleAdjustFromLookResultDescriptor.commit).toEqual(["addRuleAction"]);
  });

  it("declares commitAdvisory: an added rule lives in the Working Draft and affects no generation until publish", () => {
    expect(styleAdjustFromLookResultDescriptor.commitAdvisory).toBe(
      "A rule added here lives in the Working Draft and affects no generation until the author publishes a new Style version."
    );
  });
});

describe("style.adjustFromLookResult descriptor — assembled prompt", () => {
  it("a rejected result with director's notes: the assembled user prompt carries the project, the draft, the result lines and the note", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, RESULT_WITH_NOTES, "more painted, visible textures, no blue skies");
    expect(assembled.user).toContain("Project: Neon Skyline");
    expect(assembled.user).toContain("Direction brief: Painted, painterly rendering, no clichéd blue skies.");
    expect(assembled.user).toContain("Result kind: image");
    expect(assembled.user).toContain("Result status: rejected");
    expect(assembled.user).toContain("Director's notes on this result: This one leans too photoreal, I want more painted texture.");
    expect(assembled.user).toContain("Style text used for this test:\nWorld:\n- A rain-soaked megacity.\n\nVisual:\n- Photorealistic rendering.");
    expect(assembled.user).toContain("Director's note: more painted, visible textures, no blue skies");
  });

  it("a look-target result with no notes: the notes line is absent, and every other result line is present", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, RESULT_LOOK_TARGET, undefined);
    expect(assembled.user).toContain("Result kind: video");
    expect(assembled.user).toContain("Result status: look-target");
    expect(assembled.user).not.toMatch(/Director's notes on this result/);
    expect(assembled.user).toContain("Test source: neutral-benchmark");
    expect(assembled.user).toContain("Style source: published-version");
  });

  it("with mode: \"none\" (no Working Draft yet), the prompt stays coherent — the variable block leaves no gap", () => {
    const assembled = assemble(PROJECT, NONE_DRAFT, RESULT_WITH_NOTES, "start with a painterly look");
    expect(assembled.user).toContain("Project: Neon Skyline");
    expect(assembled.user).toContain("No Working Draft exists yet for this project.");
    expect(assembled.user).toContain("Director's note: start with a painterly look");
  });

  it("with an empty director's note, the freeText block disappears entirely from both system and user", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, RESULT_WITH_NOTES, undefined);
    expect(assembled.user).not.toMatch(/Director's note:/);
    expect(assembled.system).not.toMatch(/Respond to the director's note/);
  });

  it("with a note, the system carries the conditional rule to respond to it", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, RESULT_WITH_NOTES, "more painted");
    expect(assembled.system).toContain(
      "- Respond to the director's note below: propose only the rules it asks for, never a rewrite of the existing Working Draft."
    );
  });

  it("the system message frames the task around a real render test, states the pillar/strength/JSON rules, and forbids markdown", () => {
    const assembled = assemble(PROJECT, FILLED_DRAFT, RESULT_WITH_NOTES, undefined);
    expect(assembled.system).toContain("reviewing the report of a real render test");
    expect(assembled.system).toMatch(/atomic instruction, applicable and checkable/);
    expect(assembled.system).toMatch(/exactly one pillar/);
    expect(assembled.system).toMatch(/"Avoid"/);
    expect(assembled.system).toContain("Always respond with a valid JSON object matching exactly this schema:");
    expect(assembled.system).not.toContain("```");
  });
});
