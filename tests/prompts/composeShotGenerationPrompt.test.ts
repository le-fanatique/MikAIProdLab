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

  // SHOTPROMPT.STYLE.1 Part A (regression filet) — the compositeur is the
  // SOLE source of Style text: exactly one "Style:" occurrence when Style is
  // requested (checkbox checked -> `projectStyle` resolved), zero when it is
  // not (unchecked -> `projectStyle: null`). This is the exact assertion the
  // three Shot surfaces (runShotGeneration.ts, ShotGenerationPanel.tsx, the
  // /map page) rely on now that none of them compose a second copy via
  // `prepareGenerationStyleSource`'s own composed prompt.
  it("contains exactly one 'Style:' occurrence when Project Style is requested (checkbox checked)", () => {
    const result = composeShotGenerationPrompt(baseInput({ projectStyle: "Gritty cyberpunk realism." }));
    const occurrences = result.text.split("Style:").length - 1;
    expect(occurrences).toBe(1);
  });

  it("contains zero 'Style:' occurrences when Project Style is not requested (checkbox unchecked)", () => {
    const result = composeShotGenerationPrompt(baseInput({ projectStyle: null }));
    const occurrences = result.text.split("Style:").length - 1;
    expect(occurrences).toBe(0);
  });

  // SHOTPROMPT.STYLE.1 Part B — the resolved Project Style Avoid block
  // reaches Constraints through this composer too, never Style.
  it("passes projectStyleAvoid through to Constraints, never into Style", () => {
    const result = composeShotGenerationPrompt(
      baseInput({ projectStyle: "Gritty cyberpunk realism.", projectStyleAvoid: "Avoid:\n- No bright colors." })
    );
    const styleSection = result.sections.find((s) => s.id === "style")!;
    expect(styleSection.text).not.toContain("Avoid:");
    const compositionSection = result.sections.find((s) => s.id === "composition")!;
    expect(compositionSection.text).toContain("Constraints: Avoid:\n- No bright colors.");
  });

  // SHOTPROMPT.RENDER.1 — shot 999230's real payload: the composer must
  // never reproduce "Style: Style Rules:" nor "Constraints: Avoid:". By the
  // time `projectStyle`/`projectStyleAvoid` reach this composer they are
  // already `resolveProjectStyleTextForComposition`'s heading-less
  // `styleText`/`avoidText` (see tests/lib/resolveProjectStyleTextForComposition.test.ts)
  // — this test exercises the composer's own labeling with exactly that
  // shape, and still expects the rules/avoid content to survive.
  it("never doubles the block heading under its own 'Style: '/'Constraints:' label, and still carries the rules and the negative constraint", () => {
    const result = composeShotGenerationPrompt(
      baseInput({ projectStyle: "- textured brushwork", projectStyleAvoid: "- no bright colors" })
    );
    expect(result.text).not.toContain("Style: Style Rules:");
    expect(result.text).not.toContain("Constraints: Avoid:");
    expect(result.text).toContain("Style: - textured brushwork");
    expect(result.text).toContain("- no bright colors");
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

  // REFROLE.INTENT.1 — the job-level role overlay replaces the library's own
  // stored role for that id only, and never touches the others.
  it("applies roleOverrides in place of the library's stored role, for the overridden id only", () => {
    const references = buildOrderedShotReferenceInputs({
      hasDynamicBatch: true,
      batchSelectedIds: ["asset-1-2", "asset-1-3"],
      availableImages,
      roleOverrides: { "asset-1-2": "environment" },
    });
    expect(references.find((r) => r.refId === "asset-1-2")!.role).toBe("environment");
    expect(references.find((r) => r.refId === "asset-1-3")!.role).toBe("environment");
  });

  it("leaves the library's own stored role untouched when roleOverrides is absent", () => {
    const references = buildOrderedShotReferenceInputs({
      hasDynamicBatch: true,
      batchSelectedIds: ["asset-1-2"],
      availableImages,
    });
    expect(references[0].role).toBe("character");
  });
});

// REFROLE.INTENT.1 filet — the surchargeoverride actually changes the named
// mode `Subject Definition:` renders, i.e. it reaches getGuideModeForRole.
describe("REFROLE.INTENT.1 — the role override changes the rendered named mode", () => {
  const availableImages: RuntimeImageOption[] = [
    { id: "asset-1-2", source: "asset", imagePath: "/b.png", label: "B", role: "keyframe", assetName: "Mara", assetType: "character" },
  ];

  it("Subject Definition renders the overridden role's named mode, not the library's stored role", () => {
    const references = buildOrderedShotReferenceInputs({
      hasDynamicBatch: true,
      batchSelectedIds: ["asset-1-2"],
      availableImages,
      roleOverrides: { "asset-1-2": "environment" },
    });
    const context = buildPromptCompilationContext({
      shot: { shotPrompt: "A shot." },
      castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character" }],
      references,
      assetBibles: [],
      sources: { casting: true, references: true, assetBibles: false, sequenceContext: false, projectContext: false },
    });
    const result = composeShotGenerationPrompt(baseInput({ context, projectStyle: null }));
    expect(result.text).toContain("Mara (character) — @Image1 as background environment");
  });

  it("without an override, the library's own stored role ('keyframe') renders no named mode", () => {
    const references = buildOrderedShotReferenceInputs({
      hasDynamicBatch: true,
      batchSelectedIds: ["asset-1-2"],
      availableImages,
    });
    const context = buildPromptCompilationContext({
      shot: { shotPrompt: "A shot." },
      castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character" }],
      references,
      assetBibles: [],
      sources: { casting: true, references: true, assetBibles: false, sequenceContext: false, projectContext: false },
    });
    const result = composeShotGenerationPrompt(baseInput({ context, projectStyle: null }));
    expect(result.text).toContain("Mara (character) — @Image1");
    expect(result.text).not.toContain("as background environment");
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

  // SHOTPROMPT.STYLE.1 Part A (regression filet) — none of the three
  // surfaces may use `prepareGenerationStyleSource`'s own composing outputs
  // (`composedSuggestedPrompt.prompt` / `composeTextOverride(...)`) to build
  // the queued/previewed text any more: the compositeur above is now the
  // sole source. `prepareGenerationStyleSource` itself must still be called
  // (never debranched) so `hasEffectiveStyle`/`provenanceCandidate` keep
  // reporting honestly.
  it.each(surfaces)("%s still calls prepareGenerationStyleSource(...) but never composes its output into the queued text", (filePath) => {
    const source = readFileSync(filePath, "utf8");
    expect(source).toContain("prepareGenerationStyleSource(");
    expect(source).not.toContain("preparedStyle.composedSuggestedPrompt.prompt");
    expect(source).not.toContain("preparedStyle.composeTextOverride");
    expect(source).not.toContain("styleReady.composedSuggestedPrompt.prompt");
    expect(source).not.toContain("styleReady.composeTextOverride");
  });

  // SHOTPROMPT.STYLE.1 — `runShotGeneration.ts` is the one surface whose
  // reported provenance must stay wired: `styleActuallyInjected` and
  // `findEditedStyleTextMismatch` still read `preparedStyle`'s own
  // `hasEffectiveStyle`, proving the module was not disconnected, only
  // stopped from composing.
  it("runShotGeneration.ts still derives styleActuallyInjected from preparedStyle.hasEffectiveStyle and still calls findEditedStyleTextMismatch", () => {
    const source = readFileSync(path.join(repoRoot, "src", "lib", "comfy", "runShotGeneration.ts"), "utf8");
    expect(source).toContain("preparedStyleOk.hasEffectiveStyle");
    expect(source).toContain("findEditedStyleTextMismatch(");
  });
});

// SHOTPROMPT.STYLE.1 (Part A, preview/queue parity — coordinator retake) —
// `runShotGeneration.ts` gates `projectStyle` on the real "Append Project
// Style" choice (real per-request server data). The two preview surfaces
// (`ShotGenerationPanel.tsx`, the `/map` page) are Server Components with no
// live signal of the checkbox's client-side state at render time, so they
// cannot gate the same way — instead they must render the Style HEADER as
// its own CSS-toggled element (never a second full composed prompt), the
// same `group-has-[#appendProjectStyle:not(:checked)]` idiom
// `ProjectStyleAppendCheckbox`/`ProjectStyleGenerationPreview` already use.
// Both surfaces route through the one shared `CompiledShotPromptPreviewPanel`
// — checking that ONE file's content is sufficient to prove both agree.
describe("SHOTPROMPT.STYLE.1 Part A — preview/queue parity for Style", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const runShotGenerationPath = path.join(repoRoot, "src", "lib", "comfy", "runShotGeneration.ts");
  const panelPath = path.join(repoRoot, "src", "components", "prompts", "CompiledShotPromptPreviewPanel.tsx");
  const previewSurfaces = [
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

  it("runShotGeneration.ts gates the compositeur's projectStyle/projectStyleAvoid on styleConsumer !== null", () => {
    const source = readFileSync(runShotGenerationPath, "utf8");
    expect(source).toContain("projectStyle: styleConsumer !== null ? resolvedProjectStyle.styleText : null");
    expect(source).toContain("projectStyleAvoid: styleConsumer !== null ? resolvedProjectStyle.avoidText : null");
  });

  it("CompiledShotPromptPreviewPanel.tsx renders the Style header as its own CSS-toggled element, never a second full composed prompt", () => {
    const source = readFileSync(panelPath, "utf8");
    // The "Sections used" style block is individually toggled...
    expect(source).toContain('section.id === "style"');
    // ...and so is the Style prefix inside "Final Text" — both via the exact
    // same group-has selector the rest of this feature already uses.
    const toggleOccurrences = source.split("group-has-[#appendProjectStyle:not(:checked)]/style:hidden").length - 1;
    expect(toggleOccurrences).toBeGreaterThanOrEqual(2);
    // Never a second call to the composer — `compiled` (the panel's own
    // prop) is resolved exactly once by the caller; this panel only reads
    // it, it never recomposes.
    expect(source).not.toContain("composeShotGenerationPrompt(");
  });

  // ShotGenerationPanel.tsx renders CompiledShotPromptPreviewPanel through
  // its own extracted ShotPromptSection (IND.CLIENTSPLIT.1); the /map page
  // renders it directly. Both must still share the one `group/style`
  // ancestor with `ProjectStyleAppendCheckbox` for the CSS toggle to reach
  // the checkbox at all.
  it("ShotGenerationPanel.tsx renders the Style preview through ShotPromptSection (which renders CompiledShotPromptPreviewPanel), inside group/style with the checkbox", () => {
    const panelSource = readFileSync(previewSurfaces[0], "utf8");
    expect(panelSource).toContain("ShotPromptSection");
    expect(panelSource).toContain("group/style");
    expect(panelSource).toContain("ProjectStyleAppendCheckbox");
    const shotPromptSectionSource = readFileSync(
      path.join(repoRoot, "src", "components", "shotGenerationPanel", "ShotPromptSection.tsx"),
      "utf8"
    );
    expect(shotPromptSectionSource).toContain("CompiledShotPromptPreviewPanel");
  });

  it("the /map page renders CompiledShotPromptPreviewPanel directly, inside group/style with the checkbox", () => {
    const source = readFileSync(previewSurfaces[1], "utf8");
    expect(source).toContain("CompiledShotPromptPreviewPanel");
    expect(source).toContain("group/style");
    expect(source).toContain("ProjectStyleAppendCheckbox");
  });
});
