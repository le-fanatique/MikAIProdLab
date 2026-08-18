import { describe, expect, it } from "vitest";
import { buildPromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";
import {
  composeStoryboardShot,
  type StoryboardShotCompositionInput,
} from "@/lib/llmWorkspace/composition/storyboardShot";

// ---------------------------------------------------------------------------
// LLMW.STORYBOARD.COMPOSE.1 (B14a) — the storyboard prompt stops being one jar.
//
// The context is built through the REAL `buildPromptCompilationContext`, not a
// hand-written stand-in: the whole point of this ticket is that the pantry is
// already resolved by that function and thrown away, so a fake context would
// prove something else entirely.
//
// Direct tests on a pure module, on the precedent B12a / B12b-1 / B13a set:
// B14b is the consumer.
// ---------------------------------------------------------------------------

const ALL_SOURCES = {
  casting: true,
  references: true,
  assetBibles: true,
  sequenceContext: true,
  projectContext: true,
} as const;

function contextWith(overrides: Partial<Parameters<typeof buildPromptCompilationContext>[0]> = {}) {
  return buildPromptCompilationContext({
    shot: {
      title: "Rooftop standoff",
      actionPitch: "Mara steps out of cover.",
      cameraPitch: "slow push in",
      shotPrompt: "Mara stands on the rooftop, city behind her.",
      durationSeconds: 5,
    },
    castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "Lead, mid-30s." }],
    references: [
      { refId: "r1", source: "shot", role: "first_frame", label: "Opening frame" },
      { refId: "r2", source: "asset", assetId: 1, assetName: "Mara", role: "character", label: "Mara sheet" },
    ],
    assetBibles: [
      {
        assetId: 1,
        assetName: "Mara",
        visualIdentity: "Cropped hair, scarred jaw.",
        forbiddenVariations: "Never long hair.",
      },
    ],
    sequenceContext: { locationHint: "Rooftop, dusk", mood: "Tense" },
    projectContext: { name: "Nightfall", pitch: "A courier runs the last mile." },
    sources: { ...ALL_SOURCES },
    ...overrides,
  });
}

function inputWith(
  overrides: Partial<StoryboardShotCompositionInput> = {}
): StoryboardShotCompositionInput {
  return {
    context: contextWith(),
    continuity: { framing: "WS", cameraMovement: "static" },
    projectStyle: "Grainy anamorphic, muted palette.",
    lighting: "Cold blue screen glow.",
    ...overrides,
  };
}

describe("composeStoryboardShot", () => {
  it("renders all six parts of the guide's formula when every ingredient exists", () => {
    const result = composeStoryboardShot(inputWith());

    expect(result.parts.map((p) => p.id)).toEqual([
      "subject",
      "action",
      "environment",
      "camera",
      "lighting",
      "style",
      "constraints",
    ]);
  });

  it("carries the ingredients §5.7 found missing — casting, camera, mood, style", () => {
    const { text } = composeStoryboardShot(inputWith());

    expect(text).toContain("Mara");
    expect(text).toContain("Cropped hair, scarred jaw.");
    expect(text).toContain("slow push in");
    expect(text).toContain("Rooftop, dusk");
    expect(text).toContain("Tense");
    expect(text).toContain("Grainy anamorphic, muted palette.");
  });

  it("keeps the Shot Prompt as an ingredient — it stops being the only one, it does not disappear", () => {
    const { text, parts } = composeStoryboardShot(inputWith());

    expect(text).toContain("Mara stands on the rooftop, city behind her.");
    const action = parts.find((p) => p.id === "action")!;
    // The action pitch leads, the hand-typed jar follows — both present.
    expect(action.text).toContain("Mara steps out of cover.");
    expect(action.text).toContain("Mara stands on the rooftop, city behind her.");
  });

  it("drops a part with no ingredient instead of rendering it empty", () => {
    const result = composeStoryboardShot(
      inputWith({
        context: contextWith({ castAssets: [], assetBibles: [], sequenceContext: null }),
        projectStyle: null,
      })
    );

    expect(result.parts.map((p) => p.id)).toEqual(["action", "camera", "lighting"]);
    expect(result.text).not.toContain("Subject:");
    expect(result.text).not.toContain("Environment:");
    expect(result.text).not.toContain("Style:");
    expect(result.text).not.toContain("Constraints:");
  });

  it("renders only the negative constraints that exist — never an invented one", () => {
    const withForbidden = composeStoryboardShot(inputWith());
    expect(withForbidden.parts.find((p) => p.id === "constraints")!.text).toContain("Never long hair.");

    // §5.6: shot- and project-level negative constraints have no field at all
    // (B18). With no Asset Bible carrying one, the part is simply absent.
    const withoutForbidden = composeStoryboardShot(
      inputWith({ context: contextWith({ assetBibles: [{ assetId: 1, assetName: "Mara" }] }) })
    );
    expect(withoutForbidden.parts.some((p) => p.id === "constraints")).toBe(false);
  });

  it("puts the references through the conformation stage, with their guide modes", () => {
    const { references } = composeStoryboardShot(inputWith());

    expect(references.map((r) => r.tag)).toEqual(["@Image1", "@Image2"]);
    expect(references.map((r) => r.mode)).toEqual(["as first frame", "as character reference"]);
  });

  it("surfaces the conformation findings rather than acting on them", () => {
    const result = composeStoryboardShot(
      inputWith({ lighting: null })
    );

    // Three camera phrases, a short body, and no lighting — all reported.
    expect(result.findings.map((f) => f.code)).toContain("primaryCamera");
    expect(result.findings.map((f) => f.code)).toContain("lightingMissing");
    expect(result.findings.map((f) => f.code)).toContain("wordBudget");
    // Reported, never enforced: the text is produced whole either way.
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("reports no lighting finding when lighting is set", () => {
    const result = composeStoryboardShot(inputWith());
    expect(result.findings.map((f) => f.code)).not.toContain("lightingMissing");
  });

  it("never treats the project pitch as project style", () => {
    const result = composeStoryboardShot(inputWith({ projectStyle: null }));
    // The pitch is in the resolved context, and must not leak into Style.
    expect(result.text).not.toContain("A courier runs the last mile.");
    expect(result.parts.some((p) => p.id === "style")).toBe(false);
  });

  // LLMW.STORYBOARD.LIGHTING.1 — the author's model, 2026-08-19: a level is
  // refined by copying the one above and editing its text, exactly as
  // `sequence_style_overrides` copies a Project Style snapshot and replaces it
  // whole. So the composition renders ONE value, already resolved by
  // precedence — concatenating levels would print the same ambiance twice.
  it("renders the one resolved lighting value it is given", () => {
    const result = composeStoryboardShot(
      inputWith({ lighting: "Cold blue monitor glow, warmed toward the window." })
    );

    const lighting = result.parts.find((p) => p.id === "lighting")!.text;
    expect(lighting).toBe("Cold blue monitor glow, warmed toward the window.");
  });

  it("renders no lighting at all when none resolved, and still produces a prompt", () => {
    // His arbitration: an undefined rig must never block generation.
    const none = composeStoryboardShot(inputWith({ lighting: null }));

    expect(none.parts.some((p) => p.id === "lighting")).toBe(false);
    expect(none.text).not.toContain("Lighting:");
    expect(none.text.length).toBeGreaterThan(0);
  });

  it("is deterministic — the same input twice yields an identical composition", () => {
    expect(composeStoryboardShot(inputWith())).toEqual(composeStoryboardShot(inputWith()));
  });

  it("produces something for a Shot carrying nothing but a prompt", () => {
    const result = composeStoryboardShot({
      context: buildPromptCompilationContext({
        shot: { shotPrompt: "A door closes." },
        castAssets: [],
        references: [],
        assetBibles: [],
        sources: { ...ALL_SOURCES },
      }),
      continuity: { framing: null, cameraMovement: null },
      projectStyle: null,
      lighting: null,
    });

    expect(result.parts.map((p) => p.id)).toEqual(["action"]);
    expect(result.text).toBe("Action: A door closes.");
    expect(result.references).toEqual([]);
  });
});
