import { describe, expect, it } from "vitest";
import { sequenceLightingDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/sequenceLightingDirected";
import {
  renderSequenceLightingDirectedCurrentLine,
  renderSequenceLightingDirectedFreeTextDirective,
  SEQUENCE_LIGHTING_DIRECTED_SYSTEM_INTRO,
  SEQUENCE_LIGHTING_DIRECTED_SYSTEM_RULES,
  type SeqLightingData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// LLMW.LIGHTING.DIRECTED.1 (B16c) — render proof for
// `sequence.lightingDirected`, on the same model as
// `shotLightingDirected.render.test.ts`. The proof that matters most here
// (§ "Validation attendue", second point): on a Sequence whose own field is
// blank but whose distribution carries an environment Asset with a lighting
// value, the assembled prompt carries that INHERITED value, and says so —
// never silently presenting it as the Sequence's own.
// ---------------------------------------------------------------------------

function assemble(lighting: SeqLightingData, freeText: string | undefined) {
  return assembleDescriptorMessages(
    sequenceLightingDirectedDescriptor,
    (variableId, render) => {
      if (variableId === "SEQ.LIGHTING" && render === "sequenceLightingDirected.currentLine") {
        return renderSequenceLightingDirectedCurrentLine(lighting);
      }
      throw new Error(`unexpected variable block ${variableId}::${render}`);
    },
    undefined,
    undefined,
    undefined,
    (render) => {
      if (render !== "sequenceLightingDirected.freeTextDirective") {
        throw new Error(`unexpected freeText render form ${render}`);
      }
      return renderSequenceLightingDirectedFreeTextDirective(freeText);
    }
  );
}

describe("sequence.lightingDirected descriptor — shape", () => {
  it("anchors on sequence alone, and declares SEQ.LIGHTING as its only ingredient", () => {
    expect(sequenceLightingDirectedDescriptor.anchor).toEqual({ kind: "entity", entity: "sequence" });
    expect(sequenceLightingDirectedDescriptor.context.variables).toEqual([{ id: "SEQ.LIGHTING", userAdjustable: false }]);
  });

  it("declares intent.freeText — one director's-note consigne, no mode, no parameter", () => {
    expect(sequenceLightingDirectedDescriptor.intent).toEqual({ freeText: { label: "Director's note" } });
  });

  // See the descriptor's own header comment: no `PreconditionRef` variant
  // evaluates `SEQ.LIGHTING`'s three-way `source` correctly, so none is
  // declared — a reported gap, not a silent one.
  it("declares no preconditions — no PreconditionRef variant can evaluate SEQ.LIGHTING's source correctly", () => {
    expect(sequenceLightingDirectedDescriptor.preconditions).toBeUndefined();
  });

  it("output declares kind: \"text\", target sequence, field \"lighting\", and commits through updateSequenceLighting alone", () => {
    expect(sequenceLightingDirectedDescriptor.output).toEqual({
      kind: "text",
      target: { entity: "sequence" },
      field: "lighting",
      errors: { empty: "The model returned an empty lighting description. Try again." },
    });
    expect(sequenceLightingDirectedDescriptor.commit).toEqual(["updateSequenceLighting"]);
  });

  it("declares no images", () => {
    expect(sequenceLightingDirectedDescriptor.images).toBeUndefined();
  });
});

describe("sequence.lightingDirected descriptor — assembled prompt", () => {
  it("source 'own': the assembled prompt carries the Sequence's own value and the director's note, and does not say 'inherited'", () => {
    const assembled = assemble(
      { source: "own", lighting: "Overcast, flat daylight." },
      "Push it warmer for the rooftop scene."
    );
    expect(assembled.user).toContain("Current lighting (set directly on this Sequence): Overcast, flat daylight.");
    expect(assembled.user).toContain("Director's note: Push it warmer for the rooftop scene.");
    expect(assembled.user).not.toMatch(/inherited/);
  });

  it("source 'environment': the assembled prompt carries the INHERITED value and says it is inherited, never presenting it as the Sequence's own", () => {
    const assembled = assemble(
      {
        source: "environment",
        environments: [
          { name: "Rooftop at dusk", lighting: "Warm orange sunset, long shadows." },
          { name: "Server room", lighting: null },
        ],
      },
      "At the start he is in shadow; by the end the screens light him."
    );
    expect(assembled.user).toContain("this Sequence has none of its own — inherited from its environment Asset(s)");
    expect(assembled.user).toContain("Rooftop at dusk: Warm orange sunset, long shadows.");
    expect(assembled.user).toContain("Server room: (no lighting recorded)");
    expect(assembled.user).toContain("Director's note: At the start he is in shadow; by the end the screens light him.");
    expect(assembled.user).not.toContain("set directly on this Sequence");
  });

  it("source 'none': the assembled prompt states plainly that nothing is recorded, rather than fabricating a value", () => {
    const assembled = assemble({ source: "none" }, undefined);
    expect(assembled.user).toContain(
      "Current lighting: (none recorded — neither this Sequence nor any of its environment Assets has a lighting description)"
    );
  });

  it("with no director's note, the freeText block drops and the current value alone remains", () => {
    const assembled = assemble({ source: "own", lighting: "Warm practical light." }, undefined);
    expect(assembled.user).toContain("Current lighting (set directly on this Sequence): Warm practical light.");
    expect(assembled.user).not.toContain("Director's note:");
  });

  it("the system message frames this as an adjustment, tells the model to leave the value unchanged absent a note, and forbids JSON/markdown", () => {
    const assembled = assemble({ source: "own", lighting: "x" }, undefined);
    expect(assembled.system).toContain(SEQUENCE_LIGHTING_DIRECTED_SYSTEM_INTRO);
    expect(assembled.system).toContain(SEQUENCE_LIGHTING_DIRECTED_SYSTEM_RULES);
    expect(assembled.system).toMatch(
      /If no director's note is given below, return the current lighting description exactly as provided above, unchanged\./
    );
    expect(assembled.system).toMatch(/replaces the current lighting description entirely/);
    expect(assembled.system).not.toContain("```");
    expect(assembled.system).not.toMatch(/JSON object/);
  });
});
