import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";

// ---------------------------------------------------------------------------
// LLMW.PARAM.BOUNDS.1 (B7e-n) — proof that `normalizeIntentParameters` applies
// the frozen rule (`.agents/supervised_task.md`), on the two real
// `intent.parameters` descriptors the codebase has:
//
//   - `shotsFromSequenceDescriptor.intent.parameters` -> `targetCount`
//     (`type: "integer"`, `min: 1`, `max: 30`, `default: 6`);
//   - `outlineGenerateDescriptor.intent.parameters` -> `targetSections`
//     (`type: "integer"`, `min: 2`, `max: 20`, no `default`).
//
// Level 1 exercises the pure function directly. Level 2 goes through the real
// runner (`resolveOperationPrompt`), proving the normalization actually
// reaches the prompt — the gap the ticket exists to close.
// ---------------------------------------------------------------------------

import { normalizeIntentParameters } from "@/lib/llmWorkspace/runner";

const targetCountParams = shotsFromSequenceDescriptor.intent.parameters!;
const targetSectionsParams = outlineGenerateDescriptor.intent.parameters!;

describe("normalizeIntentParameters — level 1, the pure function", () => {
  it("keeps a valid in-bounds value unchanged", () => {
    expect(normalizeIntentParameters(targetCountParams, { targetCount: 12 })).toEqual({ targetCount: 12 });
    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: 10 })).toEqual({ targetSections: 10 });
  });

  it("integer above max: default when declared, omitted otherwise", () => {
    expect(normalizeIntentParameters(targetCountParams, { targetCount: 9999 })).toEqual({ targetCount: 6 });
    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: 99 })).toBeUndefined();
  });

  it("integer below min: default when declared, omitted otherwise", () => {
    expect(normalizeIntentParameters(targetCountParams, { targetCount: 0 })).toEqual({ targetCount: 6 });
    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: 1 })).toBeUndefined();
  });

  it("non-integer (1.5, NaN, a string): default when declared, omitted otherwise", () => {
    expect(normalizeIntentParameters(targetCountParams, { targetCount: 1.5 })).toEqual({ targetCount: 6 });
    expect(normalizeIntentParameters(targetCountParams, { targetCount: NaN })).toEqual({ targetCount: 6 });
    expect(normalizeIntentParameters(targetCountParams, { targetCount: "abc" })).toEqual({ targetCount: 6 });

    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: 1.5 })).toBeUndefined();
    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: NaN })).toBeUndefined();
    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: "abc" })).toBeUndefined();
  });

  it("declared entry not provided at all: same rule as an invalid value", () => {
    expect(normalizeIntentParameters(targetCountParams, undefined)).toEqual({ targetCount: 6 });
    expect(normalizeIntentParameters(targetCountParams, {})).toEqual({ targetCount: 6 });
    expect(normalizeIntentParameters(targetSectionsParams, undefined)).toBeUndefined();
    expect(normalizeIntentParameters(targetSectionsParams, {})).toBeUndefined();
  });

  it("a provided key not declared by any entry is dropped, not passed through", () => {
    expect(normalizeIntentParameters(targetCountParams, { targetCount: 12, bogus: "x" })).toEqual({ targetCount: 12 });
    expect(normalizeIntentParameters(targetSectionsParams, { bogus: 5 })).toBeUndefined();
  });

  it("returns undefined when nothing survives normalization", () => {
    expect(normalizeIntentParameters(undefined, { targetCount: 12 })).toBeUndefined();
    expect(normalizeIntentParameters([], { targetCount: 12 })).toBeUndefined();
    expect(normalizeIntentParameters(targetSectionsParams, { targetSections: 99 })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Level 2 — through the real runner. `shotsFromSequence.runner.test.ts` and
// `outline.generate.runner.test.ts` already prove the nominal in-bounds path
// (`targetCount: 12`, `targetSections: 6`) stays byte-for-byte identical to
// the frozen oracle; this file does not repeat that, per the ticket's own
// instruction, and instead only exercises the out-of-bounds behaviour those
// files never touched.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shots: [], outline: "## A\nBody." })),
}));

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));

  projectId = await insertProject(ctx, "Bounds project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("normalizeIntentParameters — level 2, through resolveOperationPrompt", () => {
  it("shots.fromSequence: targetCount 9999 (out of bounds) asks for 6 shots, never 9999 — the c6ad874 regression, closed", async () => {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Alley standoff",
      sequencePrompt: null,
    });

    const result = await resolveOperationPrompt(
      shotsFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { targetCount: 9999 } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.system).toContain("break a production sequence into exactly 6 individual shots");
    expect(result.prompt.system).not.toContain("9999");
    expect(result.prompt.user).not.toContain("9999");
  });

  it("outline.generate: targetSections 99 (out of bounds, no declared default) behaves exactly like targetSections absent", async () => {
    const withoutParam = await resolveOperationPrompt(outlineGenerateDescriptor, { projectId });
    expect(withoutParam.ok).toBe(true);
    if (!withoutParam.ok) throw new Error("unreachable");

    const withOutOfBoundsParam = await resolveOperationPrompt(
      outlineGenerateDescriptor,
      { projectId },
      { parameters: { targetSections: 99 } }
    );
    expect(withOutOfBoundsParam.ok).toBe(true);
    if (!withOutOfBoundsParam.ok) throw new Error("unreachable");

    expect(withOutOfBoundsParam.prompt.system).toBe(withoutParam.prompt.system);
    expect(withOutOfBoundsParam.prompt.user).toBe(withoutParam.prompt.user);
    expect(withOutOfBoundsParam.prompt.system).not.toContain("Write exactly 99 sections.");
  });
});
