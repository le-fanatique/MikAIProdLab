import { describe, expect, it } from "vitest";
import { getGuideModeForRole, getRolesWithNamedGuideMode } from "@/lib/llmWorkspace/conformation/profiles/guideDefault";
import { isReferenceImageRoleAvailableFor, REFERENCE_IMAGE_ROLES } from "@/lib/referenceImageRoles";

// ---------------------------------------------------------------------------
// REFROLE.PROP.1 — a sixth named guide mode, for `prop`.
//
// Deliberate extension beyond guideDefault.ts's own "five modes because the
// guide names five" (2.0 fact) — see that file's header comment on
// `ROLE_TO_GUIDE_MODE` for why a sixth entry is not a regression of that
// count.
// ---------------------------------------------------------------------------

describe("prop's named guide mode (REFROLE.PROP.1)", () => {
  it("prop renders 'as prop reference'", () => {
    expect(getGuideModeForRole("prop")).toBe("as prop reference");
  });

  it("the five pre-existing modes are unchanged", () => {
    expect(getGuideModeForRole("first_frame")).toBe("as first frame");
    expect(getGuideModeForRole("last_frame")).toBe("as last frame");
    expect(getGuideModeForRole("character")).toBe("as character reference");
    expect(getGuideModeForRole("style")).toBe("as style reference");
    expect(getGuideModeForRole("environment")).toBe("as background environment");
  });

  it("prop_state still has no guide mode — it is a library view, not a generation role", () => {
    expect(getGuideModeForRole("prop_state")).toBeNull();
  });

  it("prop exists in the catalogue, for both shot and asset", () => {
    expect(isReferenceImageRoleAvailableFor("prop", "shot")).toBe(true);
    expect(isReferenceImageRoleAvailableFor("prop", "asset")).toBe(true);
  });

  it("the override selector's vocabulary now contains prop, without that component being touched", () => {
    // DynamicBatchImageList.tsx builds its offered roles from
    // getRolesWithNamedGuideMode(), which reads ROLE_TO_GUIDE_MODE's own keys
    // (guideDefault.ts). Asserting against that function — not against the
    // component — is the proof it reads the table instead of a copy of it.
    const offered = getRolesWithNamedGuideMode().map((r) => r.value);
    expect(offered).toContain("prop");
    expect(offered.sort()).toEqual(
      ["character", "environment", "first_frame", "last_frame", "prop", "style"].sort()
    );
  });

  it("did not invent a second prop role — prop_state stays the only asset-specific prop entry", () => {
    const propEntries = REFERENCE_IMAGE_ROLES.filter((r) => r.value === "prop" || r.value === "prop_state");
    expect(propEntries.map((r) => r.value).sort()).toEqual(["prop", "prop_state"]);
    expect(propEntries.find((r) => r.value === "prop_state")?.category).toBe("asset_specific");
    expect(propEntries.find((r) => r.value === "prop")?.category).toBe("subject_environment");
  });
});
