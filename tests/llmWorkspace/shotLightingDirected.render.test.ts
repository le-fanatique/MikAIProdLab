import { describe, expect, it } from "vitest";
import { shotLightingDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotLightingDirected";
import {
  renderShotLightingDirectedCurrentLine,
  renderShotLightingDirectedFreeTextDirective,
  SHOT_LIGHTING_DIRECTED_SYSTEM_INTRO,
  SHOT_LIGHTING_DIRECTED_SYSTEM_RULES,
  type ShotLightingData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// LLMW.LIGHTING.DIRECTED.1 (B16c) — render proof for `shot.lightingDirected`,
// on the model of `narrativePromptCompose.render.test.ts` /
// `lightingFromImage.render.test.ts` (both descriptors with no flat-JSON
// oracle to reproduce byte-for-byte). The proof that matters most for this
// ticket (§ "Validation attendue"): the assembled prompt carries BOTH the
// current lighting value AND the director's note — an adjustment that does
// not embark what it adjusts is the one way to really fail this ticket.
// ---------------------------------------------------------------------------

function assemble(lighting: ShotLightingData, freeText: string | undefined) {
  return assembleDescriptorMessages(
    shotLightingDirectedDescriptor,
    (variableId, render) => {
      if (variableId === "SHOT.LIGHTING" && render === "shotLightingDirected.currentLine") {
        return renderShotLightingDirectedCurrentLine(lighting);
      }
      throw new Error(`unexpected variable block ${variableId}::${render}`);
    },
    undefined,
    undefined,
    undefined,
    (render) => {
      if (render !== "shotLightingDirected.freeTextDirective") {
        throw new Error(`unexpected freeText render form ${render}`);
      }
      return renderShotLightingDirectedFreeTextDirective(freeText);
    }
  );
}

describe("shot.lightingDirected descriptor — shape", () => {
  it("anchors on shot alone, and declares SHOT.LIGHTING as its only ingredient", () => {
    expect(shotLightingDirectedDescriptor.anchor).toEqual({ kind: "entity", entity: "shot" });
    expect(shotLightingDirectedDescriptor.context.variables).toEqual([{ id: "SHOT.LIGHTING", userAdjustable: false }]);
  });

  it("declares intent.freeText — one director's-note consigne, no mode, no parameter", () => {
    expect(shotLightingDirectedDescriptor.intent).toEqual({ freeText: { label: "Director's note" } });
  });

  it("declares a precondition on anchorField 'lighting' — the field being adjusted", () => {
    expect(shotLightingDirectedDescriptor.preconditions).toEqual([
      {
        refs: [{ anchorField: "lighting" }],
        require: "all",
        message: "This Shot has no lighting yet — there is nothing to adjust.",
      },
    ]);
  });

  it("output declares kind: \"text\", target shot, field \"lighting\", and commits through updateShotLighting alone", () => {
    expect(shotLightingDirectedDescriptor.output).toEqual({
      kind: "text",
      target: { entity: "shot" },
      field: "lighting",
      errors: { empty: "The model returned an empty lighting description. Try again." },
    });
    expect(shotLightingDirectedDescriptor.commit).toEqual(["updateShotLighting"]);
  });

  it("declares no images", () => {
    expect(shotLightingDirectedDescriptor.images).toBeUndefined();
  });
});

describe("shot.lightingDirected descriptor — assembled prompt", () => {
  it("the assembled user prompt carries BOTH the current lighting value and the director's note", () => {
    const assembled = assemble(
      { lighting: "Cold blue moonlight from camera left, hard shadows." },
      "At the start the character is in shadow; by the end the screens light him."
    );
    expect(assembled.user).toContain("Current lighting: Cold blue moonlight from camera left, hard shadows.");
    expect(assembled.user).toContain(
      "Director's note: At the start the character is in shadow; by the end the screens light him."
    );
    // The current value precedes the note — the model reads what it is
    // adjusting before the instruction to adjust it.
    expect(assembled.user.indexOf("Current lighting:")).toBeLessThan(assembled.user.indexOf("Director's note:"));
  });

  it("with no director's note, the freeText block drops and the current value alone remains", () => {
    const assembled = assemble({ lighting: "Warm practical light, tungsten." }, undefined);
    expect(assembled.user).toContain("Current lighting: Warm practical light, tungsten.");
    expect(assembled.user).not.toContain("Director's note:");
  });

  it("the system message frames this as an adjustment, tells the model to leave the value unchanged absent a note, and forbids JSON/markdown", () => {
    const assembled = assemble({ lighting: "x" }, undefined);
    expect(assembled.system).toContain(SHOT_LIGHTING_DIRECTED_SYSTEM_INTRO);
    expect(assembled.system).toContain(SHOT_LIGHTING_DIRECTED_SYSTEM_RULES);
    expect(assembled.system).toMatch(/If no director's note is given below, return the current lighting description exactly as provided above, unchanged\./);
    expect(assembled.system).toMatch(/replaces the current lighting description entirely/);
    expect(assembled.system).not.toContain("```");
    expect(assembled.system).not.toMatch(/JSON object/);
  });
});
