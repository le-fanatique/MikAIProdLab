import { describe, expect, it } from "vitest";
import { renderShotsFromSequenceJsonSchemaBlock } from "@/lib/llmWorkspace/variables/registry";

// ---------------------------------------------------------------------------
// SHOTGEN.INSTRUCTION.1 — `docs/SHOT_PROMPT_SD25_AUDIT.md` §9, adjustment #1.
//
// Two measured defects on real data (Sq_5000, 2026-08-19/24):
//
//   1. wardrobe drift — the old closing line ("No labels, no narrative
//      scene references — only visual content") forced the model to
//      redescribe each character's appearance on every shot, never matching
//      the asset bible, instead of naming the already-cast character;
//   2. lighting misrouted — the JSON schema asked for fourteen fields and
//      never `lighting`, so the model's lighting language landed inside
//      `shot_prompt` instead of the column built for it (`shots.lighting`).
//
// This test pins the corrected instruction directly, on the model of
// `tests/llmWorkspace/cameraInstruction.test.ts` — assertions against the
// rendered text's substance, not a byte-exact copy (the byte-exact proof
// lives in `shotsFromSequence.render.test.ts` / `.runner.test.ts`).
// ---------------------------------------------------------------------------

describe("renderShotsFromSequenceJsonSchemaBlock — SHOTGEN.INSTRUCTION.1", () => {
  const block = renderShotsFromSequenceJsonSchemaBlock(6);

  it("asks for a `lighting` field in the JSON schema, between camera_lens and continuity_out", () => {
    expect(block).toMatch(/"camera_lens":[^\n]*\n\s*"lighting":/);
    expect(block).toMatch(/"lighting":[^\n]*\n\s*"continuity_out":/);
  });

  it("describes `lighting` as this shot's own event, never the inherited ambient light", () => {
    const lightingLine = block.split("\n").find((line) => line.trim().startsWith('"lighting":'));
    expect(lightingLine).toBeDefined();
    expect(lightingLine).toMatch(/this shot only/i);
    expect(lightingLine).toMatch(/never the ambient light/i);
  });

  it("no longer forbids naming or narrative scene references", () => {
    expect(block).not.toMatch(/no labels, no narrative scene references/i);
    expect(block).not.toMatch(/only visual content/i);
  });

  it("explicitly allows naming cast characters and locations by name", () => {
    expect(block).toMatch(/may name any cast character or location by its own name/i);
  });

  it("forbids redescribing their appearance — that is the bible's job", () => {
    expect(block).toMatch(/must never redescribe their appearance/i);
  });

  it("states shot_prompt carries only what this shot alone adds, not what other fields already cover", () => {
    expect(block).toMatch(/only what this shot alone adds visually/i);
    expect(block).toMatch(/action_pitch, description, the six camera fields, or lighting/i);
  });

  it("is identical on every call for the same targetCount — deterministic, no hidden state", () => {
    expect(renderShotsFromSequenceJsonSchemaBlock(6)).toBe(block);
  });
});
