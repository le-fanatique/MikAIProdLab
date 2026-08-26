import { describe, expect, it } from "vitest";
import { buildPromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";
import { composeStoryboardShot, type StoryboardShotCompositionInput } from "@/lib/llmWorkspace/composition/storyboardShot";
import { checkPromptConsistency } from "@/lib/llmWorkspace/composition/promptConsistency";

// ---------------------------------------------------------------------------
// PROMPT.DOCTOR.1, Part A — `checkPromptConsistency`.
//
// The fixtures below reproduce the author's own defects (2026-08-26), not
// invented ones: two cast Assets described but never anchored
// (`Corporate Corridors`, `Sensor Console`), a description repeated between
// General Description and Action, and a Shot whose Sequence has Environment
// Assets to draw lighting from that the Shot itself never used.
// ---------------------------------------------------------------------------

const ALL_SOURCES = {
  casting: true,
  references: true,
  assetBibles: true,
  sequenceContext: true,
  projectContext: true,
} as const;

const NO_CONTINUITY: StoryboardShotCompositionInput["continuity"] = {
  shotSize: "WS",
  cameraPosition: "Low Angle",
  cameraMovement: "static",
  movementSpeed: null,
  cameraSubject: null,
  cameraLens: null,
};

describe("checkPromptConsistency", () => {
  // The healthy-prompt test — the one that protects the feature from
  // becoming a permanent alarm nobody reads.
  it("reports nothing on a clean composition: every cast asset named, anchored, no repeated text, lighting set", () => {
    const context = buildPromptCompilationContext({
      shot: {
        description: "Azelle checks the airlock seal before the drop.",
        actionPitch: "Mara steadies the console as the ship shudders.",
        shotPrompt: "Mara braces against the railing.",
      },
      castAssets: [
        { assetId: 1, assetName: "Mara", assetType: "character", description: "Lead." },
      ],
      references: [{ refId: "r1", source: "asset", assetId: 1, assetName: "Mara", role: "character" }],
      assetBibles: [{ assetId: 1, assetName: "Mara", promptCard: "Weathered fur, calloused hands." }],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({
      context,
      continuity: NO_CONTINUITY,
      lighting: "Cold blue console glow.",
    });

    const findings = checkPromptConsistency({ composition, context, lightingChainHadUnusedCandidate: false });

    expect(findings).toEqual([]);
  });

  // Check 1 — subject described but not declared. The author's own two
  // examples: `Corporate Corridors` and `Sensor Console`, cast without a
  // reference image, so they never reach a Subject Definition line.
  it("flags a cast asset present in Subject but absent from Subject Definition", () => {
    const context = buildPromptCompilationContext({
      shot: { actionPitch: "The crew moves through the space." },
      castAssets: [
        { assetId: 10, assetName: "Corporate Corridors", assetType: "environment", description: "Sterile corridor." },
        { assetId: 11, assetName: "Sensor Console", assetType: "prop", description: "Blinking console." },
      ],
      references: [], // neither asset has a reference image
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    const codes = findings.filter((f) => f.code === "subjectNotDeclared").map((f) => f.message);
    expect(codes.some((m) => m.includes("Corporate Corridors"))).toBe(true);
    expect(codes.some((m) => m.includes("Sensor Console"))).toBe(true);
  });

  // Check 2 — the same text repeated between General Description and Action.
  it("flags a substantial fragment repeated between General Description and Action", () => {
    const shared = "Azelle steadies herself against the vibration and scans the failing consoles";
    const context = buildPromptCompilationContext({
      shot: {
        description: shared,
        actionPitch: shared,
      },
      castAssets: [],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "duplicateText")).toBe(true);
  });

  it("does not flag a short, generic fragment shared between the two parts", () => {
    const context = buildPromptCompilationContext({
      shot: {
        description: "She walks in.",
        actionPitch: "She walks in. Then she stops and studies the room in silence.",
      },
      castAssets: [],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "duplicateText")).toBe(false);
  });

  // Check 3 — a cast asset never named in the action text.
  it("flags a cast asset never named in the Action text", () => {
    const context = buildPromptCompilationContext({
      shot: { actionPitch: "The room shakes as the alarm blares." },
      castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "Lead." }],
      references: [{ refId: "r1", source: "asset", assetId: 1, assetName: "Mara", role: "character" }],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "castAssetNotNamed" && f.message.includes("Mara"))).toBe(true);
  });

  // PROMPT.DOCTOR.2 — the author's own case: "Sensor Console" is cast, and the
  // action describes it descriptively ("failing consoles") rather than naming
  // the asset's exact card name. A partial, plural-tolerant word match must
  // find "console"/"consoles" and stay silent.
  it("does not flag a cast asset described rather than named verbatim in the Action text (plural, partial match)", () => {
    const context = buildPromptCompilationContext({
      shot: { actionPitch: "Azelle scans the failing consoles as the alarm blares." },
      castAssets: [{ assetId: 1, assetName: "Sensor Console", assetType: "prop", description: "Blinking console." }],
      references: [{ refId: "r1", source: "asset", assetId: 1, assetName: "Sensor Console", role: "environment" }],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "castAssetNotNamed")).toBe(false);
  });

  it("does not flag a cast asset that is named in the Action text", () => {
    const context = buildPromptCompilationContext({
      shot: { actionPitch: "Mara braces against the railing as the room shakes." },
      castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "Lead." }],
      references: [{ refId: "r1", source: "asset", assetId: 1, assetName: "Mara", role: "character" }],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "castAssetNotNamed")).toBe(false);
  });

  // Check 4 — an asset with neither a Prompt Card nor a reference image.
  it("flags a cast asset with no Prompt Card and no reference image", () => {
    const context = buildPromptCompilationContext({
      shot: { actionPitch: "Something happens." },
      castAssets: [{ assetId: 1, assetName: "Ghost Prop", assetType: "prop", description: "Unused." }],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "assetWithoutAnchor" && f.message.includes("Ghost Prop"))).toBe(true);
  });

  it("does not flag an asset anchored only by a Prompt Card (no reference image needed)", () => {
    const context = buildPromptCompilationContext({
      shot: { actionPitch: "Mara acts." },
      castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "Lead." }],
      references: [],
      assetBibles: [{ assetId: 1, assetName: "Mara", promptCard: "Weathered fur." }],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "assetWithoutAnchor")).toBe(false);
  });

  // Check 5 — no Lighting part despite the resolution chain having material.
  it("flags a missing Lighting part when the caller reports an unused chain candidate", () => {
    const context = buildPromptCompilationContext({
      shot: { shotPrompt: "A door closes." },
      castAssets: [],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context, lightingChainHadUnusedCandidate: true });

    expect(findings.some((f) => f.code === "lightingChainUnused")).toBe(true);
  });

  it("does not flag a missing Lighting part when nothing is reported (the default), even with no lighting set", () => {
    const context = buildPromptCompilationContext({
      shot: { shotPrompt: "A door closes." },
      castAssets: [],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    const findings = checkPromptConsistency({ composition, context });

    expect(findings.some((f) => f.code === "lightingChainUnused")).toBe(false);
  });

  it("does not flag a missing Lighting part when lighting IS set, even if the caller reports a candidate", () => {
    const context = buildPromptCompilationContext({
      shot: { shotPrompt: "A door closes." },
      castAssets: [],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: "Cold glow." });

    const findings = checkPromptConsistency({ composition, context, lightingChainHadUnusedCandidate: true });

    expect(findings.some((f) => f.code === "lightingChainUnused")).toBe(false);
  });

  it("is deterministic — the same input twice yields an identical result", () => {
    const context = buildPromptCompilationContext({
      shot: { description: "A description.", actionPitch: "An action." },
      castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "Lead." }],
      references: [],
      assetBibles: [],
      sources: { ...ALL_SOURCES },
    });
    const composition = composeStoryboardShot({ context, continuity: NO_CONTINUITY, lighting: null });

    expect(checkPromptConsistency({ composition, context })).toEqual(
      checkPromptConsistency({ composition, context })
    );
  });
});
