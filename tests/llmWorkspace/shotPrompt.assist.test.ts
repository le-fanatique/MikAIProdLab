import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";
import { shotPromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/shotPrompt";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `shotPrompt.assist`'s six
// declared variables equals what `generateShotPromptDraft`
// (`src/actions/llm/shotPrompt.ts`) used to pass to
// `buildShotPromptFromContextPrompt`, before the B3b switch.
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b): `generateShotPromptDraft`
// no longer calls `buildShotPromptFromContextPrompt`, so a mocked capture of
// the action's own call would capture nothing. The comparison now reads the
// same seeded rows directly instead, mirroring
// `sequencePrompt.assist.test.ts`'s own re-pointing at the B3a switch.
//
// `SHOT.CAST` / `SHOT.REFERENCES` are the one place this proof needs an
// extra step: the action used to pre-format the raw joined rows into
// `castSummary` / `referenceSummary` display strings.
// `formatCastSummary` / `formatReferenceSummary` below reproduce that exact
// formatting rule, so the comparison still proves the *resolved variable
// data* is what those display strings are built from — formatting itself
// belongs to the runner/template, per §3.1's resolver contract ("returns
// typed data, never a formatted string").
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shot_prompt: "A generated shot prompt." })),
}));

let ctx: TempDb;
let generateShotPromptDraft: typeof import("@/actions/llm/shotPrompt").generateShotPromptDraft;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveSeqContext: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqContext;
let resolveShotCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveShotCore;
let resolveShotCurrentPrompt: typeof import("@/lib/llmWorkspace/variables/registry").resolveShotCurrentPrompt;
let resolveShotCast: typeof import("@/lib/llmWorkspace/variables/registry").resolveShotCast;
let resolveShotReferences: typeof import("@/lib/llmWorkspace/variables/registry").resolveShotReferences;
let projectId: number;
let sequenceId: number;
let shotId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

// Reproduces the pre-switch castSummary formatting rule verbatim.
function formatCastSummary(entries: Array<{ name: string; type: string; description: string | null; notes: string | null }>): string[] {
  return entries.map((r) => {
    const extras = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join("; ");
    return extras ? `${r.name} (${r.type}: ${extras})` : `${r.name} (${r.type})`;
  });
}

// Reproduces the pre-switch referenceSummary formatting rule verbatim.
function formatReferenceSummary(
  entries: Array<{ label: string | null; imageRole: string | null; sourceFilename: string | null }>
): string[] {
  return entries.map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null).filter((s): s is string => s !== null);
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateShotPromptDraft } = await import("@/actions/llm/shotPrompt"));
  ({ resolveProjectIdentity, resolveSeqContext, resolveShotCore, resolveShotCurrentPrompt, resolveShotCast, resolveShotReferences } =
    await import("@/lib/llmWorkspace/variables/registry"));

  projectId = await insertProject(ctx, "Shot Prompt project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));

  sequenceId = await insertSequence(ctx, projectId, {
    title: "Opening sequence",
    summary: "A short summary.",
    description: "A longer description.",
    mood: "Tense",
    locationHint: "Rooftop, dusk",
  });

  shotId = await insertShot(ctx, sequenceId, {
    title: "Hero enters",
    shotCode: "SH01",
    description: "The hero steps into frame.",
    actionPitch: "Walks forward, looks up.",
    cameraPitch: "Slow push-in.",
    framing: "Medium shot",
    cameraMovement: "Dolly",
    durationSeconds: 4,
    shotPrompt: "An existing shot prompt.",
  });

  const assetIdA = await insertAsset(ctx, projectId, {
    name: "Hero",
    type: "character",
    description: "Weathered protagonist.",
    notes: "Central character.",
  });
  const assetIdB = await insertAsset(ctx, projectId, { name: "Drone", type: "prop" });
  await ctx.db.insert(ctx.schema.shotAssets).values([
    { shotId, assetId: assetIdA },
    { shotId, assetId: assetIdB },
  ]);

  await ctx.db.insert(ctx.schema.shotReferenceImages).values([
    { shotId, orderIndex: 0, imagePath: "/tmp/shot-ref-0.png", label: "Establishing frame", imageRole: "reference" },
    { shotId, orderIndex: 1, imagePath: "/tmp/shot-ref-1.png", sourceFilename: "raw-1.png", imageRole: "lighting" },
  ]);
});

afterAll(() => ctx.cleanup());

describe("shotPrompt.assist descriptor — context equality", () => {
  it("resolving the six declared variables equals the context fields the pre-switch builder read", async () => {
    const result = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(shotId),
        mode: "enhance",
      })
    );
    expect(result).toEqual({ ok: true, draft: "A generated shot prompt." });

    expect(shotPromptAssistDescriptor.context.variables.map((v) => v.id)).toEqual([
      "PROJECT.IDENTITY",
      "SEQ.CONTEXT",
      "SHOT.CORE",
      "SHOT.CURRENT_PROMPT",
      "SHOT.CAST",
      "SHOT.REFERENCES",
    ]);
    expect(shotPromptAssistDescriptor.anchor).toEqual({ kind: "entity", entity: "shot" });

    const [identity, seqContext, shotCore, currentPrompt, cast, references] = await Promise.all([
      resolveProjectIdentity(projectId),
      resolveSeqContext(sequenceId),
      resolveShotCore(shotId),
      resolveShotCurrentPrompt(shotId),
      resolveShotCast(shotId),
      resolveShotReferences(shotId),
    ]);

    // PROJECT.IDENTITY: the operation reads name/pitch/story, not
    // description/outline.
    expect({ name: identity.name, pitch: identity.pitch, story: identity.story }).toEqual({
      name: "Shot Prompt project",
      pitch: "A compelling pitch.",
      story: "A previously generated story.",
    });

    // SEQ.CONTEXT: all five fields.
    expect(seqContext).toEqual({
      title: "Opening sequence",
      summary: "A short summary.",
      description: "A longer description.",
      mood: "Tense",
      locationHint: "Rooftop, dusk",
    });

    // SHOT.CORE: all eight fields.
    expect(shotCore).toEqual({
      title: "Hero enters",
      shotCode: "SH01",
      description: "The hero steps into frame.",
      actionPitch: "Walks forward, looks up.",
      cameraPitch: "Slow push-in.",
      framing: "Medium shot",
      cameraMovement: "Dolly",
      durationSeconds: 4,
    });

    // SHOT.CURRENT_PROMPT.
    expect(currentPrompt).toEqual({ shotPrompt: "An existing shot prompt." });

    // SHOT.CAST / SHOT.REFERENCES: the raw resolved data, formatted through
    // the pre-switch display rule, equals the known display strings.
    expect(formatCastSummary(cast)).toEqual([
      "Drone (prop)",
      "Hero (character: Weathered protagonist.; Central character.)",
    ]);
    expect(formatReferenceSummary(references)).toEqual(["Establishing frame", "raw-1.png"]);

    // Intent: mode is carried on the descriptor's `intent.mode`, exercised
    // end-to-end by `shotPrompt.assist.runner.test.ts`'s own proof (test 1),
    // not re-captured here since the action no longer exposes it via a
    // mocked builder call.
    expect(shotPromptAssistDescriptor.intent.mode?.modes.map((m) => m.id)).toEqual([
      "generate",
      "enhance",
      "rewrite",
      "shorten",
      "expand",
    ]);
  });

  it("the four transform modes carry the preconditions entry generateShotPromptDraft enforces pre-call", async () => {
    // Migrated off `intent.mode.modes[].requiresNonEmpty` (§4.1 correction
    // 6): the precondition is now a `preconditions` entry, restricted to
    // the four transform modes via `modes`.
    expect(shotPromptAssistDescriptor.preconditions).toEqual([
      {
        fields: ["shotPrompt"],
        require: "all",
        modes: ["enhance", "rewrite", "shorten", "expand"],
        message: "A Shot Prompt is required for this assist mode.",
      },
    ]);

    // Cross-check against the action's real guard: a transform mode against
    // an empty shotPrompt is refused before the LLM call.
    const emptyShotId = await insertShot(ctx, sequenceId, { title: "Empty prompt shot", shotPrompt: null });
    const refused = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(emptyShotId),
        mode: "enhance",
      })
    );
    expect(refused).toEqual({
      ok: false,
      error: "A Shot Prompt is required for this assist mode.",
    });
  });
});
