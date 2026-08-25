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
    continuity: { shotSize: "WS", cameraPosition: "Low Angle", cameraMovement: "static", movementSpeed: null, cameraSubject: null, cameraLens: null },
    lighting: "Cold blue screen glow.",
    ...overrides,
  };
}

describe("composeStoryboardShot", () => {
  // SHOTPROMPT.HEADER.1 — Style is no longer one of the parts this function
  // renders: it moved to the Sequence Storyboard prompt's own header
  // (`buildSequenceStoryboardPrompt.ts`), rendered once for the whole
  // package instead of once per Shot. This assertion is the filet that must
  // fall the moment "style" reappears here.
  it("renders the five parts left of the guide's formula when every ingredient exists — Style moved to the header", () => {
    const result = composeStoryboardShot(inputWith());

    expect(result.parts.map((p) => p.id)).toEqual([
      "subject",
      "action",
      "environment",
      "camera",
      "lighting",
      "constraints",
    ]);
  });

  it("carries the ingredients §5.7 found missing — casting, camera, mood", () => {
    const { text } = composeStoryboardShot(inputWith());

    expect(text).toContain("Mara");
    expect(text).toContain("Cropped hair, scarred jaw.");
    expect(text).toContain("Low Angle");
    expect(text).toContain("Rooftop, dusk");
    expect(text).toContain("Tense");
  });

  // ASSET.PROMPTCARD.1 — the ticket's own required filet, one test per
  // branch. The absence branch is the one that protects the fourteen assets
  // with no card yet: it must prove the render is byte-for-byte unchanged
  // from before this ticket, not merely "still contains Mara".
  describe("buildSubject — the Prompt Card branch (ASSET.PROMPTCARD.1)", () => {
    it("renders name — type — card, dropping visualIdentity and description, when the asset has a Prompt Card", () => {
      const result = composeStoryboardShot(
        inputWith({
          context: contextWith({
            assetBibles: [
              {
                assetId: 1,
                assetName: "Mara",
                visualIdentity: "Cropped hair, scarred jaw.",
                promptCard: "Anthropomorphic macaque, weathered fur, calloused hands.",
              },
            ],
          }),
        })
      );

      const subject = result.parts.find((p) => p.id === "subject")!;
      expect(subject.text).toBe(
        "- Mara — character — Anthropomorphic macaque, weathered fur, calloused hands."
      );
      expect(subject.text).not.toContain("Cropped hair, scarred jaw.");
      expect(subject.text).not.toContain("Lead, mid-30s.");
    });

    it("renders exactly the pre-card fallback, byte for byte, when the asset has no Prompt Card", () => {
      // No `promptCard` at all — the case of every one of today's assets.
      const withoutCard = composeStoryboardShot(inputWith());
      const cardless = withoutCard.parts.find((p) => p.id === "subject")!;
      expect(cardless.text).toBe("- Mara — character — Cropped hair, scarred jaw. — Lead, mid-30s.");

      // An explicit blank/whitespace-only card must fall back exactly the
      // same way as a missing one — never render an empty anchor.
      const blankCard = composeStoryboardShot(
        inputWith({
          context: contextWith({
            assetBibles: [
              {
                assetId: 1,
                assetName: "Mara",
                visualIdentity: "Cropped hair, scarred jaw.",
                promptCard: "   ",
              },
            ],
          }),
        })
      );
      expect(blankCard.parts.find((p) => p.id === "subject")!.text).toBe(cardless.text);
    });

    // SHOTPROMPT.RENDER.1 — shot 999230: the author wrote his Prompt Card on
    // three lines in the textarea. A raw line break inside a `- ` list item
    // reads as the start of new bullets, breaking the list. Render-only:
    // the stored value (`promptCard`) is never rewritten, only what
    // `buildSubject` renders.
    it("collapses a multi-line Prompt Card into a single rendered line, never rewriting the stored value", () => {
      const multilineCard =
        "Anthropomorphic female macaque, weathered fur, calloused hands,\nscuffed utilitarian flight jacket over a faded undersuit,\nsharp survivalist features";
      const result = composeStoryboardShot(
        inputWith({
          context: contextWith({
            assetBibles: [{ assetId: 1, assetName: "Mara", promptCard: multilineCard }],
          }),
        })
      );

      const subject = result.parts.find((p) => p.id === "subject")!;
      expect(subject.text.split("\n")).toHaveLength(1);
      expect(subject.text).toBe(
        "- Mara — character — Anthropomorphic female macaque, weathered fur, calloused hands, scuffed utilitarian flight jacket over a faded undersuit, sharp survivalist features"
      );
    });

    // Same defect, no Prompt Card: description/visualIdentity are the
    // ticket's own explicit extension ("§4c... pas seulement la carte").
    it("collapses multi-line visualIdentity and description into single rendered lines too, in the no-card fallback", () => {
      const result = composeStoryboardShot(
        inputWith({
          context: contextWith({
            castAssets: [{ assetId: 1, assetName: "Mara", assetType: "character", description: "Lead,\nmid-30s." }],
            assetBibles: [
              { assetId: 1, assetName: "Mara", visualIdentity: "Cropped hair,\nscarred jaw." },
            ],
          }),
        })
      );

      const subject = result.parts.find((p) => p.id === "subject")!;
      expect(subject.text.split("\n")).toHaveLength(1);
      expect(subject.text).toBe("- Mara — character — Cropped hair, scarred jaw. — Lead, mid-30s.");
    });
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
      })
    );

    expect(result.parts.map((p) => p.id)).toEqual(["action", "camera", "lighting"]);
    expect(result.text).not.toContain("Subject:");
    expect(result.text).not.toContain("Environment:");
    expect(result.text).not.toContain("Style:");
    expect(result.text).not.toContain("Avoid:");
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

  // SHOTPROMPT.STYLE.1 Part B — the Project Style's `Avoid:` block joins
  // the Avoid part (SHOTPROMPT.POLARITY.1 — labelled `Avoid`, part id stays
  // `constraints`), ahead of the per-asset forbiddenVariations lines, and
  // never appears under Style (which this function does not even render —
  // see SHOTPROMPT.HEADER.1 above).
  it("folds the Project Style Avoid block into the Avoid part, ahead of forbiddenVariations", () => {
    const withStyleAvoid = composeStoryboardShot(
      inputWith({ styleAvoid: "Avoid:\n- No bright colors.\n- No daylight exteriors." })
    );
    const constraints = withStyleAvoid.parts.find((p) => p.id === "constraints")!;
    expect(constraints.text).toContain("Avoid:\n- No bright colors.\n- No daylight exteriors.");
    expect(constraints.text).toContain("Never long hair.");
    expect(constraints.text.indexOf("No bright colors")).toBeLessThan(constraints.text.indexOf("Never long hair."));
    expect(withStyleAvoid.text).not.toContain("Style:");

    // Present even with no per-asset forbiddenVariations at all.
    const styleAvoidOnly = composeStoryboardShot(
      inputWith({
        context: contextWith({ assetBibles: [{ assetId: 1, assetName: "Mara" }] }),
        styleAvoid: "Avoid:\n- No bright colors.",
      })
    );
    expect(styleAvoidOnly.parts.find((p) => p.id === "constraints")!.text).toBe("Avoid:\n- No bright colors.");

    // null/blank renders nothing extra — byte-identical to before this field existed.
    const withoutStyleAvoid = composeStoryboardShot(inputWith({ styleAvoid: null }));
    expect(withoutStyleAvoid.parts.find((p) => p.id === "constraints")!.text).toBe("- Mara: Never long hair.");
  });

  // SHOTPROMPT.POLARITY.1 — the regression filet: the composed text carries
  // `Avoid:`, never `Constraints:`, and both the Style rules' negative block
  // and the per-asset forbidden variations render under that one title, with
  // no nested heading — `styleAvoid` here is heading-less, the real shape
  // `resolveProjectStyleTextForComposition`'s `avoidText` returns.
  it("labels the part 'Avoid', never 'Constraints', with Style rules and forbiddenVariations both under it", () => {
    const result = composeStoryboardShot(
      inputWith({ styleAvoid: "- Dominant comic-book contour outlining\n- Photorealistic character rendering" })
    );

    expect(result.text).toContain("Avoid:");
    expect(result.text).not.toContain("Constraints:");
    expect(result.text).toContain("Avoid: - Dominant comic-book contour outlining");
    expect(result.text).toContain("Never long hair.");
    expect(result.text).not.toContain("Avoid: Avoid:");
  });

  it("surfaces the conformation findings rather than acting on them", () => {
    const result = composeStoryboardShot(
      inputWith({ lighting: null })
    );

    // A short body and no lighting are reported.
    expect(result.findings.map((f) => f.code)).toContain("lightingMissing");
    expect(result.findings.map((f) => f.code)).toContain("wordBudget");
    // B19e — and `primaryCamera` is NOT, which is the point. This fixture
    // names a shot size and one movement, which is correct usage; the guide
    // asks for one *move* per shot, not for one camera field to be filled.
    // Counting filled fields, as the profile did until now, warned here — and
    // would have warned on every shot once four axes existed.
    expect(result.findings.map((f) => f.code)).not.toContain("primaryCamera");
    // Reported, never enforced: the text is produced whole either way.
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("reports no lighting finding when lighting is set", () => {
    const result = composeStoryboardShot(inputWith());
    expect(result.findings.map((f) => f.code)).not.toContain("lightingMissing");
  });

  // SHOTPROMPT.HEADER.1 — the pitch-vs-style confusion this used to guard no
  // longer applies here: composeStoryboardShot has no `projectStyle` input
  // left to confuse with the pitch. `Style` itself no longer exists as one
  // of this function's part ids (asserted above).
  it("never renders the project pitch, and never renders a Style line", () => {
    const result = composeStoryboardShot(inputWith());
    // The pitch is in the resolved context, and must not leak into the text.
    expect(result.text).not.toContain("A courier runs the last mile.");
    expect(result.text).not.toContain("Style:");
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
      continuity: { shotSize: null, cameraPosition: null, cameraMovement: null, movementSpeed: null, cameraSubject: null, cameraLens: null},
      lighting: null,
    });

    expect(result.parts.map((p) => p.id)).toEqual(["action"]);
    expect(result.text).toBe("Action: A door closes.");
  });

  it("still reports primaryCamera when no movement is named at all — the finding kept its real meaning", () => {
    const result = composeStoryboardShot(
      inputWith({
        continuity: {
          shotSize: "WS",
          cameraPosition: "Low Angle",
          cameraMovement: null,
          movementSpeed: null,
          cameraSubject: null, cameraLens: null
        },
      })
    );

    expect(result.findings.map((f) => f.code)).toContain("primaryCamera");
  });

  it("does not report primaryCamera for a size, a position, a speed and one movement together", () => {
    const result = composeStoryboardShot(
      inputWith({
        continuity: {
          shotSize: "MS",
          cameraPosition: "Over-the-Shoulder (OTS)",
          cameraMovement: "Dolly In",
          movementSpeed: "Slow",
          cameraSubject: "follows Mara from the doorway to the console", cameraLens: null
        },
      })
    );

    // Four axes filled, one movement — the shape B19c's form invites.
    expect(result.findings.map((f) => f.code)).not.toContain("primaryCamera");
  });

  it("prints the camera line in the template's own order: size, position, speed + movement, then subject", () => {
    const { parts } = composeStoryboardShot(
      inputWith({
        continuity: {
          shotSize: "MS",
          cameraPosition: "Over-the-Shoulder (OTS)",
          cameraMovement: "Dolly In",
          movementSpeed: "Slow",
          cameraSubject: "follows Mara from the doorway to the console", cameraLens: null
        },
      })
    );

    // The Seedance 2.5 template asks for "shot size + camera position +
    // camera movement"; the speed rides with the movement it qualifies, and
    // the subject comes last because it is the prose naming what the move
    // targets.
    const camera = parts.find((p) => p.id === "camera");
    expect(camera?.text).toBe(
      "MS — Over-the-Shoulder (OTS) — Slow Dolly In — follows Mara from the doorway to the console"
    );
  });

});
