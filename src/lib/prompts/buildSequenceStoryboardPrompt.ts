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
//
// SHOTPROMPT.HEADER.1 — the header now carries what every Shot used to
// repeat: `Casting References:` becomes `Subject Definition:` (each line
// gains the guide's named mode for that reference's role, when it has one —
// `conformation/profiles/guideDefault.ts`'s own `ROLE_TO_GUIDE_MODE`, never a
// second table), and the Project Style — identical for every Shot, so
// `composeStoryboardShot` stopped rendering it per Shot — is rendered once,
// ahead of `Subject Definition:`.
//
// **No "unused references" block.** Considered and rejected: an unselected
// reference is never uploaded at all (`resolvedBatchImages` is built from
// `batchSelectedIds` alone — `generate/page.tsx`; `expandDynamicBatch` clones
// the chain once per selected image only), so naming its `@ImageN` here would
// tell the model about an image it never received. That block would only
// have made sense if this app attached a full asset pool and let the model's
// own request-shaping distribute roles across it — the `sd25-pe` skill's
// world, not this one's, where selection happens before the payload exists.
// See `docs/WHERE_THE_RULES_LIVE.md`.
// ---------------------------------------------------------------------------

import { getGuideModeForRole } from "@/lib/llmWorkspace/conformation/profiles/guideDefault";

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
  /**
   * SHOTPROMPT.HEADER.1 — the Project Style text, identical for every Shot
   * of this package, rendered once here instead of once per Shot
   * (`composeStoryboardShot` no longer renders it). `null`/absent/blank
   * renders nothing — never a fabricated empty `Style:` line.
   */
  projectStyle?: string | null;
  /** formatSequenceGenerationPackageText(...) output — included verbatim inside a clearly delimited block. */
  packageText: string;
  /**
   * SEQGEN.STORYBOARD.SHOTRANGE.1 — set only when the caller narrowed this
   * Storyboard to an inclusive sub-range of the Sequence's Shots (via
   * `selectStoryboardShotRange`). Absent = full sequence: the produced text
   * is then unchanged, byte-for-byte, from before this field existed.
   */
  shotRange?: {
    fromLabel: string;
    toLabel: string;
    /** Number of Shots in the whole Sequence, to situate the range. */
    totalShotCount: number;
  };
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

  // SEQGEN.STORYBOARD.SHOTRANGE.1 — only when the caller narrowed the
  // Sequence to a sub-range: absent `shotRange` must never add this line, so
  // the full-sequence text stays byte-for-byte identical to before this
  // field existed.
  if (input.shotRange) {
    goalLines.push(
      `Shot range: this Storyboard covers Shots ${input.shotRange.fromLabel} to ${input.shotRange.toLabel} only — ${input.shotCount} of the ${input.shotRange.totalShotCount} Shots in this Sequence. Shots outside this range are deliberately absent; do not infer, add or summarise them.`
    );
  }

  // SHOTPROMPT.HEADER.1 — the Project Style, rendered exactly once for the
  // whole package, ahead of `Subject Definition:`. `composeStoryboardShot`
  // no longer renders it per Shot; this is the one place it now lives.
  // `null`/absent/blank never fabricates an empty `Style:` line.
  const trimmedProjectStyle = input.projectStyle?.trim() || null;
  const styleLines: string[] = [];
  if (trimmedProjectStyle) {
    styleLines.push("", "Style:", trimmedProjectStyle);
  }

  // Lot B (SEQGEN.STORYBOARD.CASTING.FIX1), extended by SHOTPROMPT.HEADER.1
  // — the LLM-facing line is `{assetName} ({assetType}) — @ImageN`, plus the
  // guide's named mode for that reference's role when it has one
  // (`conformation/profiles/guideDefault.ts`'s own `ROLE_TO_GUIDE_MODE` —
  // five of twenty roles have a named mode; the rest get none, never an
  // invented one). `variantState`/approval status stay internal metadata
  // (still carried on `imageMappings` for the UI/snapshot/traceability
  // below), never rendered here or turned into an implicit auto-approval
  // signal for the model.
  const castingLines: string[] = [];
  if (imageMappings.length > 0) {
    castingLines.push("", "Subject Definition:");
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const m = imageMappings[i];
      const mode = getGuideModeForRole(ref.role);
      castingLines.push(`${m.assetName} (${m.assetType}) — ${m.imageLabel}${mode ? ` ${mode}` : ""}`);
    }
  }

  const packageLines = ["", PACKAGE_BLOCK_START, input.packageText, PACKAGE_BLOCK_END];

  const text = [...goalLines, ...styleLines, ...castingLines, ...packageLines].join("\n");

  return { text, imageMappings, warnings };
}
