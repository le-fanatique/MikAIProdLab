import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, insertSequence, insertShot, readAsset } from "../actions/helpers/fixtures";
import { assetRetakeDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/assetRetakeDirected";

// ---------------------------------------------------------------------------
// `asset.retakeDirected` — LLMW.UC3.ASSET_RETAKE.1 (B10), restored as a
// permanent file by this corrective manche (defect 2 of the supervisor
// review): the six cases captured during the first manche lived in a
// temporary file, deleted after capture, leaving the descriptor's one
// load-bearing property — the Shot appearances render form projects
// Description and Action Pitch, and never `cameraSubject` — with no
// regression protection. Case 5 is new in this manche, proving the
// correction to defect 1: with an empty note, the `system` no longer
// carries the unconditional "Respond to the director's direction below"
// rule.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ description: "A softened, androgynous courier silhouette." })),
}));

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let commitBenchProposal: typeof import("@/actions/llmWorkspace/bench").commitBenchProposal;

let projectId: number;
let sequenceId: number;
let assetId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ resolveOperationPrompt, runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ commitBenchProposal } = await import("@/actions/llmWorkspace/bench"));

  projectId = await insertProject(ctx, "Asset retake project");
  sequenceId = await insertSequence(ctx, projectId, { title: "Opening chase" });

  assetId = await insertAsset(ctx, projectId, {
    name: "Courier",
    type: "character",
    description: "A rugged courier in a weathered leather jacket.",
    notes: "Reads too masculine for the story's lead.",
    visualIdentity: "Angular jaw, broad shoulders, cropped hair.",
    usageRules: "Always shown in motion.",
    forbiddenVariations: "Never shown unarmed.",
  });

  const shotId = await insertShot(ctx, sequenceId, {
    title: "Rooftop entrance",
    shotCode: "SH01",
    orderIndex: 0,
    description: "The courier lands hard on the rooftop gravel.",
    actionPitch: "Rolls to a stop, scans the skyline.",
    cameraSubject: "Low-angle push-in, handheld.",
  });
  await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });
});

afterAll(() => ctx.cleanup());

describe("asset.retakeDirected — assembly (no oracle, §3 of the ticket)", () => {
  it("1. the three declared variables' fragments appear in the resolved user prompt", async () => {
    const result = await resolveOperationPrompt(assetRetakeDirectedDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // ASSET.CORE
    expect(result.prompt.user).toContain("Asset: Courier");
    expect(result.prompt.user).toContain("A rugged courier in a weathered leather jacket.");
    // ASSET.BIBLE
    expect(result.prompt.user).toContain("Angular jaw, broad shoulders, cropped hair.");
    // ASSET.SHOT_APPEARANCES
    expect(result.prompt.user).toContain("Shots this Asset appears in:");
    expect(result.prompt.user).toContain("SH01");
  });

  it("2. Shot appearances carry Description and Action Pitch, never cameraSubject", async () => {
    const result = await resolveOperationPrompt(assetRetakeDirectedDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("The courier lands hard on the rooftop gravel.");
    expect(result.prompt.user).toContain("action: Rolls to a stop, scans the skyline.");
    // The property §4 UC3 exists to prove: the projected Shot fields never
    // include cameraSubject, unlike `assetContext.shotAppearancesLines`.
    expect(result.prompt.user).not.toContain("Low-angle push-in, handheld.");
    expect(result.prompt.user).not.toMatch(/camera/i);
  });

  it("3. an Asset with no Shot produces a sensible prompt, with no orphaned section header", async () => {
    const bareAssetId = await insertAsset(ctx, projectId, {
      name: "Unused prop",
      description: "A plain wooden crate.",
    });

    const result = await resolveOperationPrompt(assetRetakeDirectedDescriptor, { projectId, assetId: bareAssetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("Asset: Unused prop");
    expect(result.prompt.user).not.toContain("Shots this Asset appears in:");
  });

  it("4. the note appears when given, and its block disappears entirely when blank", async () => {
    const withoutNote = await resolveOperationPrompt(assetRetakeDirectedDescriptor, { projectId, assetId }, {});
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) throw new Error("unreachable");
    expect(withoutNote.prompt.user).not.toMatch(/Director's direction/);

    const withNote = await resolveOperationPrompt(
      assetRetakeDirectedDescriptor,
      { projectId, assetId },
      { freeText: "soften the jawline, less masculine" }
    );
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) throw new Error("unreachable");
    expect(withNote.prompt.user).toContain("Director's direction: soften the jawline, less masculine");
    expect((withNote.prompt.user.match(/Director's direction:/g) ?? []).length).toBe(1);
  });

  it("5. with an empty note, the system no longer carries the unconditional 'Respond to the director's direction below' rule (defect 1 proof)", async () => {
    const withoutNote = await resolveOperationPrompt(assetRetakeDirectedDescriptor, { projectId, assetId }, {});
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) throw new Error("unreachable");
    expect(withoutNote.prompt.system).not.toMatch(/Respond to the director's direction/);

    const withNote = await resolveOperationPrompt(
      assetRetakeDirectedDescriptor,
      { projectId, assetId },
      { freeText: "soften the jawline" }
    );
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) throw new Error("unreachable");
    expect(withNote.prompt.system).toContain(
      "- Respond to the director's direction below: it names what is wrong with the current design and what to change."
    );
  });
});

describe("asset.retakeDirected — end-to-end commit (§4.3 / §5 of the ticket)", () => {
  it("6. runOperation + commitBenchProposal replaces description alone, leaving notes/visualIdentity/usageRules/forbiddenVariations intact", async () => {
    const before = await readAsset(ctx, assetId);

    const draft = await runOperation(
      assetRetakeDirectedDescriptor,
      { projectId, assetId },
      { freeText: "soften the jawline, less masculine" }
    );
    expect(draft).toEqual({
      ok: true,
      kind: "object",
      values: { description: "A softened, androgynous courier silhouette." },
    });
    if (!draft.ok || draft.kind !== "object") throw new Error("unreachable");

    // LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1): `RunOperationResult`'s object
    // branch now carries `string | number`, while `commitBenchProposal` still
    // takes `Record<string, string>` — it refuses numeric object values until
    // a descriptor declares one (`assertStringValues`, `bench.ts`). This
    // descriptor declares none, so the narrowing below is checked rather than
    // asserted away: a numeric value appearing here fails the test loudly
    // instead of being coerced into a string.
    const values: Record<string, string> = {};
    for (const [field, value] of Object.entries(draft.values)) {
      if (typeof value !== "string") {
        throw new Error(`asset.retakeDirected returned a non-string value for "${field}".`);
      }
      values[field] = value;
    }

    const result = await commitBenchProposal({
      templateId: "asset.retakeDirected",
      ids: { projectId, assetId },
      values,
    });

    expect(result).toEqual({ ok: true });

    const after = await readAsset(ctx, assetId);
    expect(after.description).toBe("A softened, androgynous courier silhouette.");
    expect(after.notes).toBe(before.notes);
    expect(after.visualIdentity).toBe(before.visualIdentity);
    expect(after.usageRules).toBe(before.usageRules);
    expect(after.forbiddenVariations).toBe(before.forbiddenVariations);
  });
});
