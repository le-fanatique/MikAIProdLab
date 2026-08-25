import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "../actions/helpers/fixtures";
import { assetPromptCardDescriptor } from "@/lib/llmWorkspace/descriptors/assetPromptCard";

// ---------------------------------------------------------------------------
// `asset.promptCard` — ASSET.PROMPTCARD.2. §7 of the ticket: "un test de
// rendu prouvant que la consigne porte les quatre règles du §3 et que le
// contexte de la bible arrive." No flat-JSON oracle to reproduce
// byte-for-byte (same situation as `asset.retakeDirected`/`lighting.fromImage`)
// — the proof is the descriptor's own shape plus the assembled prompt,
// against Azelle-shaped fixture data carrying the exact trap named by the
// ticket: a Bible sentence describing a state change
// ("shifts from a heavy, exhausted slouch to a rigid, focused stance").
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let commitBenchProposal: typeof import("@/actions/llmWorkspace/bench").commitBenchProposal;

let projectId: number;
let assetId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ commitBenchProposal } = await import("@/actions/llmWorkspace/bench"));

  projectId = await insertProject(ctx, "Prompt card project");

  assetId = await insertAsset(ctx, projectId, {
    name: "Azelle",
    type: "character",
    description: "A field engineer navigating a derelict station.",
    notes: "Protagonist.",
    visualIdentity:
      "Weathered fur, calloused hands, a scuffed utilitarian coat. Her posture shifts from a heavy, exhausted slouch to a rigid, focused stance.",
    usageRules: "Always shown with her toolkit.",
    forbiddenVariations: "Never bright, clean, or warm-lit.",
  });
});

afterAll(() => ctx.cleanup());

describe("asset.promptCard descriptor — shape", () => {
  it("anchors on asset alone", () => {
    expect(assetPromptCardDescriptor.anchor).toEqual({ kind: "entity", entity: "asset" });
  });

  it("declares exactly ASSET.CORE and ASSET.BIBLE as context — no new variable invented", () => {
    expect(assetPromptCardDescriptor.context.variables.map((v) => v.id).sort()).toEqual([
      "ASSET.BIBLE",
      "ASSET.CORE",
    ]);
  });

  it("declares intent.freeText — optional director's note, not the whole point of the operation", () => {
    expect(assetPromptCardDescriptor.intent).toEqual({ freeText: { label: "Director's note" } });
  });

  it("output declares kind: \"object\", target asset, field \"promptCard\", and commits through updateAssetPromptCardInline alone", () => {
    expect(assetPromptCardDescriptor.output).toMatchObject({
      kind: "object",
      target: { entity: "asset" },
    });
    if (assetPromptCardDescriptor.output.kind !== "object") throw new Error("unreachable");
    expect(assetPromptCardDescriptor.output.fields).toEqual([
      { type: "string", field: "promptCard", jsonKey: "promptCard", maxLength: 4000 },
    ]);
    expect(assetPromptCardDescriptor.commit).toEqual(["updateAssetPromptCardInline"]);
  });
});

describe("asset.promptCard — the four rules of §3 of the ticket land in the system prompt", () => {
  it("1. three to five anchors, one short sentence or list, never a paragraph", async () => {
    const result = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toMatch(/3 to 5 anchors/);
    expect(result.prompt.system).toMatch(/[Nn]ever a paragraph/);
  });

  it("2. the invariant, never a state — the state-change trap named by the ticket is called out explicitly", async () => {
    const result = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toMatch(/invariant/);
    expect(result.prompt.system).toMatch(/pose, an action, an emotion, or a state/);
    // The Bible's own state-change sentence still reaches the user prompt as
    // context (the model must be told to leave it out, not have it hidden) —
    // asserted below alongside the other Bible context.
  });

  it("3. absorb Forbidden Variations positively, never name it in the card", async () => {
    const result = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toMatch(/[Nn]ever name a Forbidden Variation/);
    expect(result.prompt.system).toMatch(/positive opposite/);
  });

  it("4. observable, physical traits, never a mood/genre label", async () => {
    const result = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toMatch(/observable, physical traits/);
    expect(result.prompt.system).toMatch(/mood word or a genre label/);
    expect(result.prompt.system).toMatch(/gritty/);
  });

  it("holds for a prop/environment wording too — no character-specific noun in the rules", async () => {
    const result = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.system).toMatch(/a character, a prop, or an environment/);
  });
});

describe("asset.promptCard — the Bible context arrives in the user prompt", () => {
  it("ASSET.CORE (name, type, description) and ASSET.BIBLE (visual identity, forbidden variations) all reach the prompt — never notes, never usage rules", async () => {
    const result = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("Asset: Azelle");
    expect(result.prompt.user).toContain("Type: character");
    expect(result.prompt.user).toContain("A field engineer navigating a derelict station.");
    expect(result.prompt.user).toContain(
      "Weathered fur, calloused hands, a scuffed utilitarian coat. Her posture shifts from a heavy, exhausted slouch to a rigid, focused stance."
    );
    expect(result.prompt.user).toContain("Never bright, clean, or warm-lit.");

    // Never carried: Notes, Usage Rules.
    expect(result.prompt.user).not.toContain("Protagonist.");
    expect(result.prompt.user).not.toContain("Always shown with her toolkit.");
  });

  it("the director's note appears when given, and its rule line disappears entirely when blank", async () => {
    const withoutNote = await resolveOperationPrompt(assetPromptCardDescriptor, { projectId, assetId }, {});
    expect(withoutNote.ok).toBe(true);
    if (!withoutNote.ok) throw new Error("unreachable");
    expect(withoutNote.prompt.user).not.toMatch(/Director's note/);
    expect(withoutNote.prompt.system).not.toMatch(/Respond to the director's note/);

    const withNote = await resolveOperationPrompt(
      assetPromptCardDescriptor,
      { projectId, assetId },
      { freeText: "insist on the silhouette" }
    );
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) throw new Error("unreachable");
    expect(withNote.prompt.user).toContain("Director's note: insist on the silhouette");
    expect(withNote.prompt.system).toContain(
      "- Respond to the director's note below: it says what to emphasize or de-emphasize, never a new visual fact to invent."
    );
  });
});

describe("asset.promptCard — end-to-end commit writes promptCard alone", () => {
  it("commitBenchProposal replaces promptCard, leaving every other Asset column intact", async () => {
    // No real generation runs in this suite (§6 of the ticket) — only the
    // commit path is exercised here, with a hand-written card standing in
    // for an approved model draft, on the same model as
    // `asset.retakeDirected`'s own end-to-end commit test.
    const before = await readAsset(ctx, assetId);

    const result = await commitBenchProposal({
      templateId: "asset.promptCard",
      ids: { projectId, assetId },
      values: { promptCard: "Scuffed utilitarian coat, weathered fur, calloused hands, cool cyan nav light" },
    });

    expect(result).toEqual({ ok: true });

    const after = await readAsset(ctx, assetId);
    expect(after.promptCard).toBe(
      "Scuffed utilitarian coat, weathered fur, calloused hands, cool cyan nav light"
    );
    expect(after.description).toBe(before.description);
    expect(after.notes).toBe(before.notes);
    expect(after.visualIdentity).toBe(before.visualIdentity);
    expect(after.usageRules).toBe(before.usageRules);
    expect(after.forbiddenVariations).toBe(before.forbiddenVariations);
  });
});
