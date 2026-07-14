// ---------------------------------------------------------------------------
// referenceImageRoles.ts — Shared reference-image role catalogue
// (REFROLE.MVP.1).
//
// Pure, deterministic module: no DB, no browser, no LLM call. Single
// source of truth for every role value a Shot or Asset reference image
// can carry — canonical labels, UI grouping, per-context availability,
// and legacy-alias normalization. Never renames or rewrites a stored
// value: every legacy value (`reference`, `keyframe`, `character`,
// `environment`, ...) stays a first-class, readable entry here, not a
// deprecated fallback.
//
// src/actions/shotReferenceImages.ts and src/actions/assetReferenceImages.ts
// derive their server-side whitelist from this catalogue instead of
// maintaining their own duplicated list. src/lib/prompts/promptCompilerPresets.ts
// re-exports isFirstFrameRole/isLastFrameRole from here — one role
// contract, never two contradictory ones.
// ---------------------------------------------------------------------------

export type ReferenceImageRoleCategory =
  | "frame_timeline"
  | "subject_environment"
  | "style_direction"
  | "asset_specific"
  | "legacy_other";

export type ReferenceImageContext = "shot" | "asset";

export type ReferenceImageRoleDefinition = {
  /** Canonical, stored value — exactly what's written to imageRole. Never mutated. */
  value: string;
  /** English UI label, no underscores. */
  label: string;
  category: ReferenceImageRoleCategory;
  /** Which reference tables offer this role as a NEW selection. A role already stored on an existing row remains valid/readable regardless of this list — see getReferenceImageRoleLabel(). */
  availableFor: ReferenceImageContext[];
};

const CATEGORY_LABELS: Record<ReferenceImageRoleCategory, string> = {
  frame_timeline: "Frame / Timeline",
  subject_environment: "Subject / Environment",
  style_direction: "Style / Direction",
  asset_specific: "Asset-specific",
  legacy_other: "Legacy / Other",
};

/**
 * The full catalogue, in display order. General roles (available for both
 * Shot and Asset) come first, then Asset-specific roles, then the
 * catch-all/legacy bucket. Order within a category is the order options
 * render in — no alphabetical resort.
 */
export const REFERENCE_IMAGE_ROLES: readonly ReferenceImageRoleDefinition[] = [
  // Frame / Timeline
  { value: "first_frame", label: "First Frame", category: "frame_timeline", availableFor: ["shot", "asset"] },
  { value: "last_frame", label: "Last Frame", category: "frame_timeline", availableFor: ["shot", "asset"] },
  { value: "keyframe", label: "Keyframe", category: "frame_timeline", availableFor: ["shot", "asset"] },
  { value: "storyboard_frame", label: "Storyboard Frame", category: "frame_timeline", availableFor: ["shot", "asset"] },
  { value: "continuity_anchor", label: "Continuity Anchor", category: "frame_timeline", availableFor: ["shot", "asset"] },

  // Subject / Environment
  { value: "character", label: "Character", category: "subject_environment", availableFor: ["shot", "asset"] },
  { value: "environment", label: "Environment", category: "subject_environment", availableFor: ["shot", "asset"] },

  // Style / Direction
  { value: "style", label: "Style", category: "style_direction", availableFor: ["shot", "asset"] },
  { value: "lighting", label: "Lighting", category: "style_direction", availableFor: ["shot", "asset"] },
  { value: "camera", label: "Camera", category: "style_direction", availableFor: ["shot", "asset"] },
  { value: "motion", label: "Motion", category: "style_direction", availableFor: ["shot", "asset"] },
  { value: "rhythm", label: "Rhythm", category: "style_direction", availableFor: ["shot", "asset"] },

  // Asset-specific
  { value: "identity", label: "Identity", category: "asset_specific", availableFor: ["asset"] },
  { value: "full_body", label: "Full Body", category: "asset_specific", availableFor: ["asset"] },
  { value: "expression", label: "Expression", category: "asset_specific", availableFor: ["asset"] },
  { value: "pose", label: "Pose", category: "asset_specific", availableFor: ["asset"] },
  { value: "costume", label: "Costume", category: "asset_specific", availableFor: ["asset"] },
  { value: "environment_view", label: "Environment View", category: "asset_specific", availableFor: ["asset"] },
  { value: "prop_state", label: "Prop State", category: "asset_specific", availableFor: ["asset"] },

  // Legacy / Other
  { value: "reference", label: "Reference", category: "legacy_other", availableFor: ["shot", "asset"] },
  { value: "other", label: "Other", category: "legacy_other", availableFor: ["shot", "asset"] },
];

const ROLES_BY_VALUE: ReadonlyMap<string, ReferenceImageRoleDefinition> = new Map(
  REFERENCE_IMAGE_ROLES.map((r) => [r.value, r])
);

/**
 * Alias -> canonical value, case-insensitive. Every canonical value maps
 * to itself; additionally its space-separated and no-separator spellings
 * are recognized (matches the space/no-space aliasing already used by
 * isFirstFrameRole/isLastFrameRole before this ticket). Exact-match only
 * — never fuzzy/substring matching, so an unknown string is never
 * accidentally treated as known.
 */
const ROLE_ALIASES: ReadonlyMap<string, string> = new Map(
  REFERENCE_IMAGE_ROLES.flatMap((r) => {
    const spaced = r.value.replace(/_/g, " ");
    const joined = r.value.replace(/_/g, "");
    const variants = new Set([r.value, spaced, joined, r.label.toLowerCase()]);
    return [...variants].map((alias) => [alias, r.value] as const);
  })
);

/** Resolves any known canonical value or legacy alias (case-insensitive) to its canonical stored value. Returns null for anything unrecognized — never guesses. */
export function normalizeReferenceImageRoleValue(role: string | null | undefined): string | null {
  if (!role) return null;
  const trimmed = role.trim().toLowerCase();
  return ROLE_ALIASES.get(trimmed) ?? null;
}

/** Looks up the full definition for a stored (or alias) role value. Null when unrecognized. */
export function getReferenceImageRoleDefinition(
  role: string | null | undefined
): ReferenceImageRoleDefinition | null {
  const canonical = normalizeReferenceImageRoleValue(role);
  return canonical ? ROLES_BY_VALUE.get(canonical) ?? null : null;
}

/**
 * English UI label for any role value, known or not. Known values use
 * their catalogue label; unknown/legacy-but-uncatalogued values fall back
 * to a simple underscore-to-space, title-cased rendering — a stored value
 * is always shown readably, never blanked.
 */
export function getReferenceImageRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  const def = getReferenceImageRoleDefinition(role);
  if (def) return def.label;
  return role
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isKnownReferenceImageRole(role: string | null | undefined): boolean {
  return getReferenceImageRoleDefinition(role) !== null;
}

/** Whether `role` is valid as a NEW selection for the given context (Shot or Asset). Unknown values are always rejected. */
export function isReferenceImageRoleAvailableFor(
  role: string | null | undefined,
  context: ReferenceImageContext
): boolean {
  const def = getReferenceImageRoleDefinition(role);
  return def !== null && def.availableFor.includes(context);
}

export type ReferenceImageRoleOption = { value: string; label: string };
export type ReferenceImageRoleGroup = { category: ReferenceImageRoleCategory; label: string; options: ReferenceImageRoleOption[] };

/**
 * Catalogue roles available for a given context, grouped in display
 * order (Frame/Timeline, Subject/Environment, Style/Direction,
 * Asset-specific, Legacy/Other). Empty categories are omitted. Used
 * directly by the reference-image forms to render `<optgroup>`s.
 */
export function getReferenceImageRoleGroups(context: ReferenceImageContext): ReferenceImageRoleGroup[] {
  const order: ReferenceImageRoleCategory[] = [
    "frame_timeline",
    "subject_environment",
    "style_direction",
    "asset_specific",
    "legacy_other",
  ];
  const groups: ReferenceImageRoleGroup[] = [];
  for (const category of order) {
    const options = REFERENCE_IMAGE_ROLES.filter(
      (r) => r.category === category && r.availableFor.includes(context)
    ).map((r) => ({ value: r.value, label: r.label }));
    if (options.length > 0) {
      groups.push({ category, label: CATEGORY_LABELS[category], options });
    }
  }
  return groups;
}

/** Role strings that count as an explicit First Frame reference, matched case-insensitively via the shared catalogue aliases. */
export function isFirstFrameRole(role: string | null | undefined): boolean {
  return normalizeReferenceImageRoleValue(role) === "first_frame";
}

/** Role strings that count as an explicit Last Frame reference, matched case-insensitively via the shared catalogue aliases. */
export function isLastFrameRole(role: string | null | undefined): boolean {
  return normalizeReferenceImageRoleValue(role) === "last_frame";
}
