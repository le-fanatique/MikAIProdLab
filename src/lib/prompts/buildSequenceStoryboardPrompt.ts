// ---------------------------------------------------------------------------
// buildSequenceStoryboardPrompt.ts — Sequence Storyboard prompt builder
// (SEQGEN.STORYBOARD.3).
//
// Pure function: no DB, no browser, no network, no Date.now()/Math.random().
// Turns an already-ordered, already-deduplicated list of selected casting
// references plus the formatted Sequence Generation Package text (from
// buildSequenceGenerationPackage.ts, itself unmodified) into a single
// editable prompt for a contact-sheet-style Sequence Storyboard image: one
// thumbnail per Shot, in Sequence order. Assigns a deterministic `@ImageN`
// label per reference (N = 1-based position in the caller's own order) —
// this function never reorders or re-selects references itself.
//
// Never fabricates context: a reference with no role/variant/approval data
// simply omits that line rather than inventing a placeholder value, and an
// empty selection produces a real warning instead of a silently empty
// mapping section.
// ---------------------------------------------------------------------------

export type SequenceStoryboardReferenceInput = {
  /** Same id format as RuntimeImageOption ("asset-{assetId}-{imageId}") — the transport key, not shown to the model. */
  refId: string;
  assetId: number;
  assetName: string;
  assetType: string;
  /** Raw stored role (e.g. "identity"), if any. */
  role: string | null;
  /** Human-readable role label, if any — never derived here, always passed in from the shared role catalogue. */
  roleLabel: string | null;
  label: string | null;
  variantState: string | null;
  approvedForGeneration: boolean;
};

export type SequenceStoryboardPromptInput = {
  projectId: number;
  sequenceId: number;
  sequenceTitle: string | null;
  sequenceCode: string | null;
  /** Number of Shots in the Sequence, for the goal statement — not re-derived from packageText. */
  shotCount: number;
  /** Already ordered (selection order) and deduplicated by refId — this function never reorders or dedupes beyond a defensive pass. */
  references: SequenceStoryboardReferenceInput[];
  /** formatSequenceGenerationPackageText(...) output — included verbatim inside a clearly delimited block. */
  packageText: string;
};

export type SequenceStoryboardImageMapping = {
  refId: string;
  /** "@Image1", "@Image2", ... — 1-based, deterministic from `references`' own order. */
  imageLabel: string;
  assetId: number;
  assetName: string;
  assetType: string;
  roleLabel: string | null;
  variantState: string | null;
  approvedForGeneration: boolean;
};

export type SequenceStoryboardPrompt = {
  text: string;
  /** Same order as the input `references`, one entry per reference, after defensive dedup. */
  imageMappings: SequenceStoryboardImageMapping[];
  warnings: string[];
};

function dedupeByRefId(
  references: SequenceStoryboardReferenceInput[]
): SequenceStoryboardReferenceInput[] {
  const seen = new Set<string>();
  const result: SequenceStoryboardReferenceInput[] = [];
  for (const ref of references) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    result.push(ref);
  }
  return result;
}

const PACKAGE_BLOCK_START = "=== Sequence Generation Package ===";
const PACKAGE_BLOCK_END = "=== End Sequence Generation Package ===";

export function buildSequenceStoryboardPrompt(
  input: SequenceStoryboardPromptInput
): SequenceStoryboardPrompt {
  const references = dedupeByRefId(input.references);

  const warnings: string[] = [];
  if (references.length === 0) {
    warnings.push("No casting references selected in Storyboard Assets.");
  }
  if (input.shotCount === 0) {
    warnings.push("This Sequence has no Shots yet.");
  }
  const unapproved = references.filter((r) => !r.approvedForGeneration);
  if (unapproved.length > 0) {
    warnings.push(
      `${unapproved.length} selected reference${unapproved.length !== 1 ? "s are" : " is"} not approved for generation.`
    );
  }

  const imageMappings: SequenceStoryboardImageMapping[] = references.map((ref, i) => ({
    refId: ref.refId,
    imageLabel: `@Image${i + 1}`,
    assetId: ref.assetId,
    assetName: ref.assetName,
    assetType: ref.assetType,
    roleLabel: ref.roleLabel,
    variantState: ref.variantState,
    approvedForGeneration: ref.approvedForGeneration,
  }));

  const sequenceHeaderParts = [
    `Project ${input.projectId} / Sequence ${input.sequenceId}`,
    input.sequenceCode ? `(${input.sequenceCode})` : null,
    input.sequenceTitle ? `— ${input.sequenceTitle}` : null,
  ].filter((p): p is string => Boolean(p));

  const goalLines = [
    "Sequence Storyboard Prompt",
    sequenceHeaderParts.join(" "),
    "",
    `Goal: produce a single contact-sheet storyboard image containing exactly ${input.shotCount} thumbnail${
      input.shotCount !== 1 ? "s" : ""
    }, one per Shot, arranged in Sequence order (left to right, top to bottom). Each thumbnail must depict that Shot's framing, composition, staging and continuity as described in the Sequence Generation Package below. Do not merge, skip, duplicate or reorder Shots.`,
  ];

  const castingLines: string[] = [];
  if (imageMappings.length > 0) {
    castingLines.push("", "Casting References:");
    for (const m of imageMappings) {
      const parts = [
        `${m.imageLabel} — ${m.assetName} (${m.assetType})`,
        m.roleLabel ? m.roleLabel : null,
        m.variantState ? m.variantState : null,
        !m.approvedForGeneration ? "(Not approved for generation)" : null,
      ].filter((p): p is string => Boolean(p));
      castingLines.push(parts.join(" · "));
    }
  }

  const packageLines = ["", PACKAGE_BLOCK_START, input.packageText, PACKAGE_BLOCK_END];

  const text = [...goalLines, ...castingLines, ...packageLines].join("\n");

  return { text, imageMappings, warnings };
}
