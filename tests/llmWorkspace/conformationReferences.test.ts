import { describe, expect, it } from "vitest";
import {
  CONFORMATION_PROFILES,
  DEFAULT_CONFORMATION_PROFILE_ID,
  getConformationProfile,
  type ConformationReference,
} from "@/lib/llmWorkspace/conformation";

// ---------------------------------------------------------------------------
// LLMW.CONFORMATION.1 (B13a) — the conformation stage's first half: stored
// reference roles rendered into the guide's named image modes.
//
// Proven directly, with no database, no model and no pipeline: the module is
// deterministic by construction (§5.3 — an assembly is recomputed, never
// stored), so a direct call IS the proof. B12a and B12b-1 already shipped
// engines ahead of their consumers on the same reasoning; B14 is this one's
// consumer.
// ---------------------------------------------------------------------------

const profile = getConformationProfile(DEFAULT_CONFORMATION_PROFILE_ID);

function refs(...roles: Array<string | null>): ConformationReference[] {
  return roles.map((role, i) => ({ role, label: `Image ${i + 1}` }));
}

describe("guide.default — reference conformation", () => {
  it("renders the guide's five named modes, and only those five", () => {
    const result = profile.conformReferences({
      references: refs("first_frame", "last_frame", "character", "style", "environment"),
      camera: { phrases: [], movements: [] },
    });

    expect(result.map((r) => r.mode)).toEqual([
      "as first frame",
      "as last frame",
      "as character reference",
      "as style reference",
      "as background environment",
    ]);
  });

  it("tags by the request's own order, never by role", () => {
    const result = profile.conformReferences({
      // Deliberately not the order the mode table lists them in.
      references: refs("style", "first_frame", "character"),
      camera: { phrases: [], movements: [] },
    });

    expect(result.map((r) => r.tag)).toEqual(["@Image1", "@Image2", "@Image3"]);
    expect(result[0].mode).toBe("as style reference");
    expect(result[1].mode).toBe("as first frame");
  });

  it("keeps the tag and reports no mode for a role the guide does not name", () => {
    const result = profile.conformReferences({
      references: refs("pose", "motion", "rhythm", "prop_state"),
      camera: { phrases: [], movements: [] },
    });

    expect(result.map((r) => r.tag)).toEqual(["@Image1", "@Image2", "@Image3", "@Image4"]);
    expect(result.every((r) => r.mode === null)).toBe(true);
    // The role itself survives — the reference is untyped for the engine, not lost.
    expect(result.map((r) => r.role)).toEqual(["pose", "motion", "rhythm", "prop_state"]);
  });

  it("treats an absent or unrecognized role as a role with no mode, never as an error", () => {
    const result = profile.conformReferences({
      references: [
        { role: null, label: "No role" },
        { role: "some_legacy_value_nobody_knows", label: "Stale row" },
      ],
      camera: { phrases: [], movements: [] },
    });

    expect(result.map((r) => r.tag)).toEqual(["@Image1", "@Image2"]);
    expect(result.map((r) => r.mode)).toEqual([null, null]);
    expect(result.map((r) => r.role)).toEqual([null, null]);
  });

  it("does not fold keyframe into the first-frame mode — they are two roles the user chose between", () => {
    const result = profile.conformReferences({
      references: refs("keyframe"),
      camera: { phrases: [], movements: [] },
    });

    expect(result[0].role).toBe("keyframe");
    expect(result[0].mode).toBeNull();
  });

  it("reads a stored value through the catalogue's own aliases", () => {
    const result = profile.conformReferences({
      references: [
        { role: "first frame", label: "spaced spelling" },
        { role: "FIRST_FRAME", label: "upper case" },
      ],
      camera: { phrases: [], movements: [] },
    });

    expect(result.map((r) => r.role)).toEqual(["first_frame", "first_frame"]);
    expect(result.map((r) => r.mode)).toEqual(["as first frame", "as first frame"]);
  });

  it("carries the label through untouched, and never a path", () => {
    const result = profile.conformReferences({
      references: [{ role: "character", label: "Lead, three-quarter" }],
      camera: { phrases: [], movements: [] },
    });

    expect(result[0].label).toBe("Lead, three-quarter");
    expect(Object.keys(result[0]).sort()).toEqual(["label", "mode", "role", "tag"]);
  });

  it("is deterministic — the same request twice yields an identical result", () => {
    const request = { references: refs("first_frame", "pose", null), camera: { phrases: ["slow push in"], movements: ["slow push in"] } };
    expect(profile.conformReferences(request)).toEqual(profile.conformReferences(request));
  });

  it("ignores the camera phrases entirely at this stage — they are counted by B13b, never read", () => {
    const withCamera = profile.conformReferences({
      references: refs("character"),
      camera: { phrases: ["slow push in", "handheld", "crane down"], movements: ["slow push in", "handheld", "crane down"] },
    });
    const withoutCamera = profile.conformReferences({
      references: refs("character"),
      camera: { phrases: [], movements: [] },
    });

    expect(withCamera).toEqual(withoutCamera);
  });

  it("returns nothing for no references, rather than an empty-tag placeholder", () => {
    expect(profile.conformReferences({ references: [], camera: { phrases: [], movements: [] } })).toEqual([]);
  });

  it("exposes exactly one profile today, named for what it is and not for an engine", () => {
    expect(Object.keys(CONFORMATION_PROFILES)).toEqual(["guide.default"]);
    expect(JSON.stringify(CONFORMATION_PROFILES).toLowerCase()).not.toContain("seedance");
  });
});
