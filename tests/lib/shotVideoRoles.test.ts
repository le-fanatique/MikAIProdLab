import { describe, expect, it } from "vitest";
import {
  getReferenceImageRoleGroups,
  isReferenceImageRoleAvailableFor,
  REFERENCE_IMAGE_ROLES,
} from "@/lib/referenceImageRoles";

// ---------------------------------------------------------------------------
// B17a — the `shotVideo` context.
//
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.6: the guide keys its video modes
// on roles — camera replication, motion imitation, rhythm matching — and
// `camera`, `motion` and `rhythm` already existed in the catalogue, offered on
// image contexts only. This ticket opened them for video and invented no role.
//
// The upload form is built from `getReferenceImageRoleGroups("shotVideo")` and
// the action validates with `isReferenceImageRoleAvailableFor(..., "shotVideo")`,
// so these two agreeing is what makes a tampered form unable to store a role
// the UI never showed.
// ---------------------------------------------------------------------------

describe("the shotVideo role context", () => {
  it("offers exactly the three roles the guide's video modes are keyed on", () => {
    const offered = getReferenceImageRoleGroups("shotVideo")
      .flatMap((group) => group.options.map((option) => option.value))
      .sort();

    expect(offered).toEqual(["camera", "motion", "rhythm"]);
  });

  it("invented no role — every one it offers already existed in the catalogue", () => {
    const catalogue = new Set(REFERENCE_IMAGE_ROLES.map((role) => role.value));
    for (const value of ["camera", "motion", "rhythm"]) {
      expect(catalogue.has(value)).toBe(true);
    }
  });

  it("accepts what it offers, and refuses what it does not", () => {
    expect(isReferenceImageRoleAvailableFor("camera", "shotVideo")).toBe(true);
    expect(isReferenceImageRoleAvailableFor("motion", "shotVideo")).toBe(true);
    expect(isReferenceImageRoleAvailableFor("rhythm", "shotVideo")).toBe(true);

    // Image modes, deliberately not video modes.
    expect(isReferenceImageRoleAvailableFor("first_frame", "shotVideo")).toBe(false);
    expect(isReferenceImageRoleAvailableFor("character", "shotVideo")).toBe(false);
    // Asset-only, and nonsense.
    expect(isReferenceImageRoleAvailableFor("costume", "shotVideo")).toBe(false);
    expect(isReferenceImageRoleAvailableFor("not_a_role", "shotVideo")).toBe(false);
    expect(isReferenceImageRoleAvailableFor(null, "shotVideo")).toBe(false);
  });

  it("what the form offers is exactly what the action accepts", () => {
    // The property that makes a tampered submission harmless: there is no
    // value the select can produce that validation would reject, and none it
    // hides that validation would accept.
    const offered = getReferenceImageRoleGroups("shotVideo").flatMap((g) =>
      g.options.map((o) => o.value)
    );
    for (const value of offered) {
      expect(isReferenceImageRoleAvailableFor(value, "shotVideo")).toBe(true);
    }
    const accepted = REFERENCE_IMAGE_ROLES.filter((r) =>
      isReferenceImageRoleAvailableFor(r.value, "shotVideo")
    ).map((r) => r.value);
    expect(accepted.sort()).toEqual([...offered].sort());
  });

  it("did not disturb the image contexts", () => {
    // The three roles stay available where they already were.
    for (const value of ["camera", "motion", "rhythm"]) {
      expect(isReferenceImageRoleAvailableFor(value, "shot")).toBe(true);
      expect(isReferenceImageRoleAvailableFor(value, "asset")).toBe(true);
    }
    // And no image role gained a video context by accident.
    expect(isReferenceImageRoleAvailableFor("last_frame", "shot")).toBe(true);
    expect(isReferenceImageRoleAvailableFor("last_frame", "shotVideo")).toBe(false);
  });
});
