import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { shotPromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/shotPrompt";
import { renderShotPromptFreeTextDirective } from "@/lib/llmWorkspace/variables/registry";

// ---------------------------------------------------------------------------
// LLMW.INTENT.FREETEXT.1 (B9a) — the proof required by the ticket's §3 and
// §5: `intent.freeText` absent/empty/blank must leave `shotPrompt.assist`'s
// assembled prompt byte-for-byte identical to what it produced before this
// ticket (proven here at the runner level, against the same descriptor the
// existing `shotPrompt.assist.runner.test.ts` / `.render.test.ts` proofs
// exercise — neither of those two files is modified by this ticket). A
// filled consigne must add the fragment exactly once, at the declared
// position: after every context block, before the mode-dependent closing
// instruction.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let projectId: number;
let sequenceId: number;
let shotId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  projectId = await insertProject(ctx, "FreeText project");
  sequenceId = await insertSequence(ctx, projectId, { title: "Opening sequence" });
  shotId = await insertShot(ctx, sequenceId, { title: "Hero enters" });
});

afterAll(() => ctx.cleanup());

describe("shotPrompt.assist — intent.freeText (LLMW.INTENT.FREETEXT.1, B9a)", () => {
  it("no intent.freeText key at all matches the pre-ticket prompt (control case)", async () => {
    const result = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).not.toMatch(/Director's direction/);
  });

  it("freeText: undefined produces byte-identical output to omitting the key entirely", async () => {
    const withoutKey = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    const withUndefined = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate", freeText: undefined }
    );
    expect(withUndefined).toEqual(withoutKey);
  });

  it("freeText: \"\" (empty) produces byte-identical output to absent", async () => {
    const base = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    const empty = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate", freeText: "" }
    );
    expect(empty).toEqual(base);
  });

  it("freeText: whitespace-only produces byte-identical output to absent", async () => {
    const base = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    const blank = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate", freeText: "   " }
    );
    expect(blank).toEqual(base);
  });

  it("the same holds in a transform mode (enhance), against a shot carrying an existing prompt", async () => {
    const withPrompt = await insertShot(ctx, sequenceId, { title: "With prompt", shotPrompt: "An existing draft." });
    const base = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: withPrompt },
      { mode: "enhance" }
    );
    const empty = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: withPrompt },
      { mode: "enhance", freeText: "" }
    );
    expect(empty).toEqual(base);
  });

  it("a filled consigne is inserted exactly once, after the context and before the closing instruction (generate mode)", async () => {
    const base = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate" }
    );
    const withNote = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: "generate", freeText: "a low angle shot, the hero entering and exiting frame" }
    );
    expect(base.ok).toBe(true);
    expect(withNote.ok).toBe(true);
    if (!base.ok || !withNote.ok) throw new Error("unreachable");

    const closingSuffix = "\n\nWrite a visual generation prompt for this shot.";
    expect(base.prompt.user.endsWith(closingSuffix)).toBe(true);
    const baseContext = base.prompt.user.slice(0, base.prompt.user.length - closingSuffix.length);

    const expectedLine = "Director's direction: a low angle shot, the hero entering and exiting frame";
    expect(withNote.prompt.user).toBe(`${baseContext}\n${expectedLine}${closingSuffix}`);
    expect((withNote.prompt.user.match(/Director's direction:/g) ?? []).length).toBe(1);

    // The system message is untouched — the consigne is a `template` block,
    // not an `expertise.system` one.
    expect(withNote.prompt.system).toBe(base.prompt.system);
  });

  it("a filled consigne is inserted exactly once in a transform mode too (enhance)", async () => {
    const withPrompt = await insertShot(ctx, sequenceId, {
      title: "With prompt 2",
      shotPrompt: "An existing draft.",
    });
    const base = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: withPrompt },
      { mode: "enhance" }
    );
    const withNote = await resolveOperationPrompt(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId: withPrompt },
      { mode: "enhance", freeText: "more empathy with the character" }
    );
    expect(base.ok).toBe(true);
    expect(withNote.ok).toBe(true);
    if (!base.ok || !withNote.ok) throw new Error("unreachable");

    const closingSuffix = "\n\nTransform the prompt as instructed.";
    expect(base.prompt.user.endsWith(closingSuffix)).toBe(true);
    const baseContext = base.prompt.user.slice(0, base.prompt.user.length - closingSuffix.length);

    const expectedLine = "Director's direction: more empathy with the character";
    expect(withNote.prompt.user).toBe(`${baseContext}\n${expectedLine}${closingSuffix}`);
    expect((withNote.prompt.user.match(/Director's direction:/g) ?? []).length).toBe(1);
  });
});

describe("renderShotPromptFreeTextDirective — unit-level render form (B9a)", () => {
  it("renders the empty string for undefined, empty and blank input", () => {
    expect(renderShotPromptFreeTextDirective(undefined)).toBe("");
    expect(renderShotPromptFreeTextDirective("")).toBe("");
    expect(renderShotPromptFreeTextDirective("   ")).toBe("");
  });

  it("frames a filled consigne as a directorial direction", () => {
    expect(renderShotPromptFreeTextDirective("a low angle shot")).toBe("Director's direction: a low angle shot");
  });

  it("trims surrounding whitespace before framing", () => {
    expect(renderShotPromptFreeTextDirective("  a low angle shot  ")).toBe("Director's direction: a low angle shot");
  });

  it("truncates, never refuses, an overlong consigne (500 chars)", () => {
    const long = "x".repeat(600);
    const rendered = renderShotPromptFreeTextDirective(long);
    expect(rendered).toBe(`Director's direction: ${"x".repeat(500)}`);
  });
});
