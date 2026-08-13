import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "./helpers/tempDb";

/**
 * Correspondence proof for `src/lib/llmWorkspace/actions/bindings.ts`
 * (LLMW.ACTION.REGISTRY.1b / B4b).
 *
 * Three obligations, per the ticket:
 *
 * 1. Reference identity — `ACTION_BINDINGS[id]` is the same reference
 *    (`toBe`) as the export imported directly from its own module, for each
 *    of the seven `ActionId`s. If identity holds, no execution path changed.
 * 2. Completeness — `ACTION_BINDINGS` and `ACTION_REGISTRY` declare exactly
 *    the same set of keys. The compiler already guarantees this via
 *    `satisfies`; this is the readable runtime assertion of that guarantee.
 * 3. Effective switch-over — each of the seven Approve-side component files
 *    no longer imports any of the seven action names from `@/actions/...`,
 *    and imports `ACTION_BINDINGS` instead.
 *
 * Action modules import `@/db` at module scope, so — per this directory's
 * convention (`tests/actions/registry.test.ts`) — both `bindings.ts` and the
 * action modules it wraps are imported dynamically, in `beforeAll`, after
 * `setupTempDb()` has set `DB_PATH`.
 */

let ctx: TempDb;
let bindings: typeof import("@/lib/llmWorkspace/actions/bindings");
let registry: typeof import("@/lib/llmWorkspace/actions/registry");
let assetsActions: typeof import("@/actions/assets");
let shotsActions: typeof import("@/actions/shots");
let sequencesActions: typeof import("@/actions/sequences");
let storyActions: typeof import("@/actions/llm/story");
let outlineActions: typeof import("@/actions/llm/outlineGeneration");

beforeAll(async () => {
  ctx = await setupTempDb();
  bindings = await import("@/lib/llmWorkspace/actions/bindings");
  registry = await import("@/lib/llmWorkspace/actions/registry");
  assetsActions = await import("@/actions/assets");
  shotsActions = await import("@/actions/shots");
  sequencesActions = await import("@/actions/sequences");
  storyActions = await import("@/actions/llm/story");
  outlineActions = await import("@/actions/llm/outlineGeneration");
});

afterAll(() => ctx.cleanup());

describe("ACTION_BINDINGS — reference identity", () => {
  it("updateAssetDetailsInline is the same reference as @/actions/assets's export", () => {
    expect(bindings.ACTION_BINDINGS.updateAssetDetailsInline).toBe(
      assetsActions.updateAssetDetailsInline
    );
  });

  it("updateAssetDescriptionFieldInline is the same reference as @/actions/assets's export", () => {
    expect(bindings.ACTION_BINDINGS.updateAssetDescriptionFieldInline).toBe(
      assetsActions.updateAssetDescriptionFieldInline
    );
  });

  it("applyBatchAssetDescriptionDraftsInline is the same reference as @/actions/assets's export", () => {
    expect(bindings.ACTION_BINDINGS.applyBatchAssetDescriptionDraftsInline).toBe(
      assetsActions.applyBatchAssetDescriptionDraftsInline
    );
  });

  it("updateShotPrompt is the same reference as @/actions/shots's export", () => {
    expect(bindings.ACTION_BINDINGS.updateShotPrompt).toBe(shotsActions.updateShotPrompt);
  });

  it("updateSequencePrompt is the same reference as @/actions/sequences's export", () => {
    expect(bindings.ACTION_BINDINGS.updateSequencePrompt).toBe(
      sequencesActions.updateSequencePrompt
    );
  });

  it("applyGeneratedStory is the same reference as @/actions/llm/story's export", () => {
    expect(bindings.ACTION_BINDINGS.applyGeneratedStory).toBe(storyActions.applyGeneratedStory);
  });

  it("applyGeneratedOutline is the same reference as @/actions/llm/outlineGeneration's export", () => {
    expect(bindings.ACTION_BINDINGS.applyGeneratedOutline).toBe(
      outlineActions.applyGeneratedOutline
    );
  });
});

describe("ACTION_BINDINGS — completeness against ACTION_REGISTRY", () => {
  it("declares exactly the same set of keys as ACTION_REGISTRY", () => {
    const bindingKeys = Object.keys(bindings.ACTION_BINDINGS).sort();
    const registryKeys = Object.keys(registry.ACTION_REGISTRY).sort();
    expect(bindingKeys).toEqual(registryKeys);
  });
});

describe("ACTION_BINDINGS — the seven Approve-side callers switched over", () => {
  // Named explicitly rather than by a generic rule, so the six out-of-scope
  // files that also import these actions (AssetInlineDetailsForm.tsx,
  // ShotPromptForm.tsx, SequencePromptForm.tsx, InlineShotPromptEditor.tsx,
  // PromptCompilerPanel.tsx, PromptComposerPanel.tsx) are never swept in.
  const switchedFiles: Array<{ file: string; actionNames: string[] }> = [
    { file: "src/components/StoryGenerationPanel.tsx", actionNames: ["applyGeneratedStory"] },
    { file: "src/components/OutlineGenerationPanel.tsx", actionNames: ["applyGeneratedOutline"] },
    {
      file: "src/components/AssetBibleEnhancePanel.tsx",
      actionNames: ["updateAssetDetailsInline"],
    },
    {
      file: "src/components/AssetDescriptionEnhancePanel.tsx",
      actionNames: ["updateAssetDescriptionFieldInline"],
    },
    {
      file: "src/components/BatchAssetDescriptionEnhancePanel.tsx",
      actionNames: [
        "updateAssetDescriptionFieldInline",
        "applyBatchAssetDescriptionDraftsInline",
      ],
    },
    { file: "src/components/ShotPromptLLMAssistPanel.tsx", actionNames: ["updateShotPrompt"] },
    {
      file: "src/components/SequencePromptLLMAssistPanel.tsx",
      actionNames: ["updateSequencePrompt"],
    },
  ];

  it.each(switchedFiles)("$file imports ACTION_BINDINGS, not the action(s) directly", (testCase) => {
    const source = readFileSync(path.join(process.cwd(), testCase.file), "utf8");

    expect(source).toMatch(
      /import\s*\{\s*ACTION_BINDINGS\s*\}\s*from\s*["']@\/lib\/llmWorkspace\/actions\/bindings["']/
    );

    for (const actionName of testCase.actionNames) {
      const directImportFromActions = new RegExp(
        `import\\s*\\{[^}]*\\b${actionName}\\b[^}]*\\}\\s*from\\s*["']@/actions/`
      );
      expect(source).not.toMatch(directImportFromActions);
    }
  });
});
