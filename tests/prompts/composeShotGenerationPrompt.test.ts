import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOrderedShotReferenceInputs,
  composeShotGenerationPrompt,
  type ComposeShotGenerationPromptInput,
} from "@/lib/prompts/composeShotGenerationPrompt";
import { buildPromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";

function baseContext() {
  return buildPromptCompilationContext({
    shot: {
      title: "Close on Mara",
      description: "Mara grips her weapon.",
      actionPitch: "She raises her weapon.",
      cameraPitch: "Low angle, wide lens.",
      durationSeconds: 5,
      shotPrompt: "Mara stands on the rooftop.",
      compiledPromptSegments: "0-2s: static shot",
      hasPromptSegments: true,
      hasMissingTiming: false,
    },
    castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "cyberpunk farmer" }],
    references: [
      { refId: "shot-1", source: "shot", label: "Rooftop wide", role: "establishing" },
      {
        refId: "asset-1-2",
        source: "asset",
        assetId: 1,
        assetName: "Mara",
        assetType: "character",
        role: "character",
      },
    ],
    assetBibles: [
      {
        assetId: 1,
        assetName: "Mara",
        assetType: "character",
        visualIdentity: "Tall, weathered coat.",
        forbiddenVariations: "Never smiling.",
      },
    ],
    sequenceContext: { title: "The Standoff", mood: "tense", locationHint: "Rooftop" },
    projectContext: { name: "Neon Harvest", pitch: "A cyberpunk farmer." },
    sources: { casting: true, references: true, assetBibles: true, sequenceContext: true, projectContext: true },
  });
}

function baseInput(overrides: Partial<ComposeShotGenerationPromptInput> = {}): ComposeShotGenerationPromptInput {
  return {
    kind: "image",
    context: baseContext(),
    continuity: {
      shotSize: "medium shot",
      cameraPosition: "eye level",
      cameraMovement: null,
      movementSpeed: null,
      cameraSubject: null,
      cameraLens: null,
    },
    lighting: "Harsh rooftop sun.",
    projectStyle: "Gritty cyberpunk realism.",
    ...overrides,
  };
}

describe("composeShotGenerationPrompt", () => {
  it("renders Style, Subject Definition, the six-part composition and Timeline in order for a video Shot with casting, references and segments", () => {
    const result = composeShotGenerationPrompt(baseInput({ kind: "video" }));

    expect(result.kind).toBe("video");
    expect(result.usedTimeline).toBe(true);
    expect(result.sections.map((s) => s.id)).toEqual(["style", "subjectDefinition", "composition", "timeline"]);

    // Order in the final text: Style: line, then Subject Definition:, then
    // the six-part composition, then Timeline: — SHOTPROMPT.SHOT.1 §4b.
    const styleIndex = result.text.indexOf("Style: Gritty cyberpunk realism.");
    const subjectDefIndex = result.text.indexOf("Subject Definition:");
    const subjectPartIndex = result.text.indexOf("Subject: - Mara");
    const timelineIndex = result.text.indexOf("Timeline:\n0-2s: static shot");
    expect(styleIndex).toBeGreaterThanOrEqual(0);
    expect(styleIndex).toBeLessThan(subjectDefIndex);
    expect(subjectDefIndex).toBeLessThan(subjectPartIndex);
    expect(subjectPartIndex).toBeLessThan(timelineIndex);

    // Subject Definition names the cast reference with its @ImageN and named
    // mode — never the shot-sourced reference, which carries no assetName.
    expect(result.text).toContain("Mara (character) — @Image2 as character reference");
    expect(result.text).not.toContain("@Image1 as");

    // The six-part composeStoryboardShot body is reused, not reimplemented.
    expect(result.text).toContain("Camera: medium shot — eye level");
    expect(result.text).toContain("Lighting: Harsh rooftop sun.");
    expect(result.text).toContain("Constraints: - Mara: Never smiling.");
  });

  it("omits the Style line when no Project Style is resolved", () => {
    const result = composeShotGenerationPrompt(baseInput({ projectStyle: null }));
    expect(result.sections.some((s) => s.id === "style")).toBe(false);
    expect(result.text.startsWith("Style:")).toBe(false);
  });

  it("omits Subject Definition when no casting reference carries an assetName", () => {
    const context = buildPromptCompilationContext({
      shot: { shotPrompt: "Empty rooftop at dawn." },
      castAssets: [],
      references: [{ refId: "shot-1", source: "shot", label: "Rooftop wide" }],
      assetBibles: [],
      sources: { casting: false, references: true, assetBibles: false, sequenceContext: false, projectContext: false },
    });
    const result = composeShotGenerationPrompt(baseInput({ context, projectStyle: null }));
    expect(result.sections.some((s) => s.id === "subjectDefinition")).toBe(false);
  });

  it("never includes Timeline for an image Shot, even with Prompt Segments", () => {
    const result = composeShotGenerationPrompt(baseInput({ kind: "image" }));
    expect(result.usedTimeline).toBe(false);
    expect(result.sections.some((s) => s.id === "timeline")).toBe(false);
    expect(result.text).not.toContain("Timeline:");
  });

  it("keeps compileShotPrompt's own warnings (Timeline responsibility, never emptied)", () => {
    const context = buildPromptCompilationContext({
      shot: {},
      castAssets: [],
      references: [],
      assetBibles: [],
      sources: { casting: false, references: false, assetBibles: false, sequenceContext: false, projectContext: false },
    });
    const result = composeShotGenerationPrompt(baseInput({ context, projectStyle: null }));
    expect(result.warnings).toContain("Shot Prompt is empty.");
  });
});

describe("buildOrderedShotReferenceInputs — @ImageN follows the batch selection, never DB order", () => {
  const availableImages: RuntimeImageOption[] = [
    { id: "shot-1", source: "shot", imagePath: "/a.png", label: "A", role: null },
    { id: "asset-1-2", source: "asset", imagePath: "/b.png", label: "B", role: "character", assetName: "Mara", assetType: "character" },
    { id: "asset-1-3", source: "asset", imagePath: "/c.png", label: "C", role: "environment", assetName: "Mara", assetType: "character" },
  ];

  it("orders references by the batch's own selection when a Dynamic Batch node is usable — mutation 2's exact case", () => {
    // Selection order is the reverse of `availableImages`' own (DB) order.
    const batchSelectedIds = ["asset-1-3", "shot-1", "asset-1-2"];
    const references = buildOrderedShotReferenceInputs({ hasDynamicBatch: true, batchSelectedIds, availableImages });
    expect(references.map((r) => r.refId)).toEqual(["asset-1-3", "shot-1", "asset-1-2"]);

    const context = buildPromptCompilationContext({
      shot: {},
      castAssets: [],
      references,
      assetBibles: [],
      sources: { casting: false, references: true, assetBibles: false, sequenceContext: false, projectContext: false },
    });
    // @Image1 must be the batch's first pick ("asset-1-3"), never the DB's
    // first row ("shot-1").
    expect(context.imageMap["@Image1"].refId).toBe("asset-1-3");
    expect(context.imageMap["@Image2"].refId).toBe("shot-1");
    expect(context.imageMap["@Image3"].refId).toBe("asset-1-2");
  });

  it("falls back to the available order when there is no usable Dynamic Batch node", () => {
    const references = buildOrderedShotReferenceInputs({
      hasDynamicBatch: false,
      batchSelectedIds: ["asset-1-3", "shot-1", "asset-1-2"],
      availableImages,
    });
    expect(references.map((r) => r.refId)).toEqual(["shot-1", "asset-1-2", "asset-1-3"]);
  });
});

describe("SHOTPROMPT.SHOT.1 filet — the three Shot surfaces call the same composer", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const surfaces = [
    path.join(repoRoot, "src", "lib", "comfy", "runShotGeneration.ts"),
    path.join(repoRoot, "src", "components", "ShotGenerationPanel.tsx"),
    path.join(
      repoRoot,
      "src",
      "app",
      "projects",
      "[projectId]",
      "sequences",
      "[sequenceId]",
      "shots",
      "[shotId]",
      "workflows",
      "[workflowId]",
      "map",
      "page.tsx"
    ),
  ];

  it.each(surfaces)("%s calls composeShotGenerationPrompt(...) — never a second recomposition", (filePath) => {
    const source = readFileSync(filePath, "utf8");
    expect(source).toContain("composeShotGenerationPrompt({");
    expect(source).toContain('from "@/lib/prompts/composeShotGenerationPrompt"');
  });
});
