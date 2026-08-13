import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";
import { shotPromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/shotPrompt";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `shotPrompt.assist`'s six
// declared variables equals what `generateShotPromptDraft`
// (`src/actions/llm/shotPrompt.ts`) passes to `buildShotPromptFromContextPrompt`
// today. Same two mocks, same real seeded database, same dynamic-import
// discipline as `sequencePrompt.assist.test.ts` — see that file's header for
// the full rationale.
//
// `SHOT.CAST` / `SHOT.REFERENCES` are the one place this ticket's proof
// needs an extra step: the action does not pass the raw joined rows to the
// builder, it pre-formats them into `castSummary` / `referenceSummary`
// display strings (`src/actions/llm/shotPrompt.ts` lines building
// `castSummary`/`referenceSummary`). `formatCastSummary` /
// `formatReferenceSummary` below reproduce that exact formatting rule, so
// the comparison still proves the *resolved variable data* is what the
// action's strings are built from — formatting itself belongs to the
// runner/template B2 builds, per §3.1's resolver contract ("returns typed
// data, never a formatted string").
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ shot_prompt: "A generated shot prompt." })),
}));

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/shot-prompt-from-context", () => ({
  buildShotPromptFromContextPrompt: (ctx: unknown) => captureBuilderArg(ctx),
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

// Reproduces `generateShotPromptDraft`'s castSummary formatting rule verbatim.
function formatCastSummary(entries: Array<{ name: string; type: string; description: string | null; notes: string | null }>): string[] {
  return entries.map((r) => {
    const extras = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join("; ");
    return extras ? `${r.name} (${r.type}: ${extras})` : `${r.name} (${r.type})`;
  });
}

// Reproduces `generateShotPromptDraft`'s referenceSummary formatting rule verbatim.
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
  it("resolving the six declared variables equals the context fields generateShotPromptDraft passes to its builder", async () => {
    const result = await generateShotPromptDraft(
      form({
        projectId: String(projectId),
        sequenceId: String(sequenceId),
        shotId: String(shotId),
        mode: "enhance",
      })
    );
    expect(result).toEqual({ ok: true, draft: "A generated shot prompt." });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      projectName: string;
      projectPitch: string | null;
      projectStory: string | null;
      sequenceTitle: string;
      sequenceSummary: string | null;
      sequenceDescription: string | null;
      sequenceMood: string | null;
      sequenceLocationHint: string | null;
      shotTitle: string;
      shotCode: string | null;
      shotDescription: string | null;
      actionPitch: string | null;
      cameraPitch: string | null;
      framing: string | null;
      cameraMovement: string | null;
      durationSeconds: number | null;
      currentShotPrompt: string | null;
      castSummary: string[];
      referenceSummary: string[];
      assistMode: string;
    };

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

    // PROJECT.IDENTITY: the action reads name/pitch/story, not
    // description/outline.
    expect({ name: identity.name, pitch: identity.pitch, story: identity.story }).toEqual({
      name: actionArg.projectName,
      pitch: actionArg.projectPitch,
      story: actionArg.projectStory,
    });

    // SEQ.CONTEXT: all five fields.
    expect(seqContext).toEqual({
      title: actionArg.sequenceTitle,
      summary: actionArg.sequenceSummary,
      description: actionArg.sequenceDescription,
      mood: actionArg.sequenceMood,
      locationHint: actionArg.sequenceLocationHint,
    });

    // SHOT.CORE: all eight fields.
    expect(shotCore).toEqual({
      title: actionArg.shotTitle,
      shotCode: actionArg.shotCode,
      description: actionArg.shotDescription,
      actionPitch: actionArg.actionPitch,
      cameraPitch: actionArg.cameraPitch,
      framing: actionArg.framing,
      cameraMovement: actionArg.cameraMovement,
      durationSeconds: actionArg.durationSeconds,
    });

    // SHOT.CURRENT_PROMPT.
    expect(currentPrompt).toEqual({ shotPrompt: actionArg.currentShotPrompt });

    // SHOT.CAST / SHOT.REFERENCES: the raw resolved data, formatted through
    // the action's own known display rule, equals the actual formatted
    // strings the action built.
    expect(formatCastSummary(cast)).toEqual(actionArg.castSummary);
    expect(formatReferenceSummary(references)).toEqual(actionArg.referenceSummary);

    // Intent: mode is carried on the descriptor's `intent.mode`, mirroring
    // sequencePrompt.assist one entity kind over.
    expect(shotPromptAssistDescriptor.intent.mode?.modes.map((m) => m.id)).toEqual([
      "generate",
      "enhance",
      "rewrite",
      "shorten",
      "expand",
    ]);
    expect(actionArg.assistMode).toBe("enhance");
  });

  it("the four transform modes carry the preconditions entry generateShotPromptDraft enforces pre-call", async () => {
    // Migrated off `intent.mode.modes[].requiresNonEmpty` (§4.1 correction
    // 6): the precondition is now a `preconditions` entry, restricted to
    // the four transform modes via `modes`.
    expect(shotPromptAssistDescriptor.preconditions).toEqual([
      {
        field: "shotPrompt",
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
