// ---------------------------------------------------------------------------
// conformation/index.ts — LLMW.CONFORMATION.1 (B13a)
//
// The closed profile registry, on the same model as the variable and image
// registries: a caller names a profile, never a rule.
//
// One entry today. §5.5 requires the stage to be replaceable per engine, and a
// registry is how a second engine arrives without any consumer changing: B14
// asks for `"guide.default"` and gets whatever that profile decides, and a
// future caller can ask for another.
// ---------------------------------------------------------------------------

import type { ConformationProfile, ConformationProfileId } from "./types";
import { guideDefaultProfile } from "./profiles/guideDefault";

export const CONFORMATION_PROFILES = {
  "guide.default": guideDefaultProfile,
} satisfies Record<ConformationProfileId, ConformationProfile>;

/** The profile a consumer gets when it has no reason to ask for another. */
export const DEFAULT_CONFORMATION_PROFILE_ID: ConformationProfileId = "guide.default";

export function getConformationProfile(id: ConformationProfileId): ConformationProfile {
  return CONFORMATION_PROFILES[id];
}

export type {
  ConformationFinding,
  ConformationFindingCode,
  ConformationInspectionRequest,
  ConformationProfile,
  ConformationProfileId,
  ConformationReference,
  ConformationRequest,
  ConformedReference,
} from "./types";
