import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";
import { assetsFromProjectDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromProject";

// ---------------------------------------------------------------------------
// Level-2 proof required by the ticket ("Validation attendue" §2): the real
// runner dispatch (`resolveOperationPrompt` / `runOperation`, `runner.ts`),
// through a real seeded database, not a hand-built dispatcher — same
// discipline as `shotsFromSequence.runner.test.ts` /
// `sequencesFromOutline.runner.test.ts`.
//
// Also carries the guard proof ("Validation attendue" §4): both
// `preconditions` entries, exercised through `runOperation`, including the
// half of the "No narrative content found" gate `fields: FieldRef[]` could
// not express before this ticket — no pitch/story/outline, but a Sequence
// present, must pass.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ assets: [] })),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));
});

afterAll(() => ctx.cleanup());

describe("assets.fromProject — runner prompt-equality proof", () => {
  it("matches buildAssetsFromProjectPrompt for a fully seeded project (sequences, shots, existing assets, includeShots true)", async () => {
    const projectId = await insertProject(ctx, "Neon Skyline");
    const { eq } = await import("drizzle-orm");
    await ctx.db
      .update(ctx.schema.projects)
      .set({
        pitch: "A courier races across a rain-soaked megacity.",
        story: "Full story text goes here.",
        outline: "## Opening\nThe courier receives the package.\n\n## Chase\nA rooftop pursuit begins.",
      })
      .where(eq(ctx.schema.projects.id, projectId));

    const sequenceId = await insertSequence(ctx, projectId, {
      title: "Rooftop chase",
      summary: "The courier is chased across the rooftops.",
      description: "A tense pursuit at night.",
      mood: "Tense, kinetic",
      locationHint: "Rain-soaked rooftops, neon skyline",
      narrativePurpose: "Escalates the central conflict.",
    });
    await insertShot(ctx, sequenceId, {
      title: "Wide establishing",
      description: "Neon skyline at dusk.",
      actionPitch: "The courier sprints.",
      continuityIn: "Calm street.",
      continuityOut: "Alley entered.",
    });
    await insertAsset(ctx, projectId, { name: "Kai the Courier", type: "character" });
    await insertAsset(ctx, projectId, { name: "Neon Alley", type: "environment" });

    const runnerResult = await resolveOperationPrompt(
      assetsFromProjectDescriptor,
      { projectId },
      { parameters: { includeShots: true, assetTypes: ["character", "environment", "prop"] } }
    );
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expected = { system: `You are a production asset supervisor and art department coordinator for the project "Neon Skyline".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: character, environment, prop

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of character, environment, prop
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Neon Skyline
Pitch: A courier races across a rain-soaked megacity.

PROJECT OUTLINE (primary narrative source):
## Opening
The courier receives the package.

## Chase
A rooftop pursuit begins.

SEQUENCES:
- Rooftop chase | Summary: The courier is chased across the rooftops. | Description: A tense pursuit at night. | Purpose: Escalates the central conflict. | Mood: Tense, kinetic | Location: Rain-soaked rooftops, neon skyline

SHOTS:
- Wide establishing | Neon skyline at dusk. | Action: The courier sprints. | In: Calm street. | Out: Alley entered.

EXISTING ASSETS (for duplicate detection — do not re-create these unless significantly different):
- Kai the Courier (character)
- Neon Alley (environment)

Extract up to 20 production assets from the above narrative material. Asset types to include: character, environment, prop.` };

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("no parameters supplied: falls back to the declared defaults (includeShots: false, assetTypes: character/environment/prop) — matches buildAssetsFromProjectPrompt with those same defaults", async () => {
    const projectId = await insertProject(ctx, "Bare Skyline");
    const { eq } = await import("drizzle-orm");
    await ctx.db.update(ctx.schema.projects).set({ pitch: "A pitch." }).where(eq(ctx.schema.projects.id, projectId));
    await insertSequence(ctx, projectId, { title: "Only sequence" });

    const runnerResult = await resolveOperationPrompt(assetsFromProjectDescriptor, { projectId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    const expected = { system: `You are a production asset supervisor and art department coordinator for the project "Bare Skyline".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: character, environment, prop

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of character, environment, prop
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`, user: `Project: Bare Skyline
Pitch: A pitch.

SEQUENCES:
- Only sequence

Extract up to 20 production assets from the above narrative material. Asset types to include: character, environment, prop.` };

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });
});

describe("assets.fromProject — preconditions proof", () => {
  it("no asset type selected (empty multiEnum) is refused before the LLM call, with the exact precondition message", async () => {
    const projectId = await insertProject(ctx, "Guard project");
    const { eq } = await import("drizzle-orm");
    await ctx.db.update(ctx.schema.projects).set({ pitch: "A pitch." }).where(eq(ctx.schema.projects.id, projectId));

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: [] } });
    expect(result).toEqual({ ok: false, error: "Select at least one asset type." });
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });

  it("no pitch, no story, no outline, no sequences at all is refused with the exact precondition message", async () => {
    const projectId = await insertProject(ctx, "Empty project");

    const result = await runOperation(assetsFromProjectDescriptor, { projectId });
    expect(result).toEqual({
      ok: false,
      error: "No narrative content found. Add a pitch, story, outline, or sequences first.",
    });
  });

  it("no pitch, no story, no outline, but a Sequence exists: passes — the half of the gate 'fields' could not express before this ticket", async () => {
    const projectId = await insertProject(ctx, "Sequence-only project");
    await insertSequence(ctx, projectId, { title: "The only narrative source" });

    const result = await resolveOperationPrompt(assetsFromProjectDescriptor, { projectId });
    expect(result.ok).toBe(true);
  });
});
