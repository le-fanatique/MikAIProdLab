// ---------------------------------------------------------------------------
// buildSequenceVideoPrompt.ts — Sequence Video prompt builder (SEQGEN.VIDEO.1).
//
// Pure function: no DB, no browser, no network, no Date.now()/Math.random().
// A dedicated builder — deliberately NOT a reuse of
// buildSequenceStoryboardPrompt.ts, which stays reserved for the contact-
// sheet STORYBOARD IMAGE prompt. This one asks for a single continuous
// VIDEO, using the already-generated Sequence Storyboard board as the visual
// PLAN for staging/framing/order — never as a literal mosaic to reproduce
// frame-for-frame across the whole video — plus the same Sequence Generation
// Package text (shot order, prompts, durations, camera, action, continuity,
// warnings) already used by the storyboard prompt.
//
// The board is always @Image1 — the mandatory visual anchor, never replaced
// or displaced by casting references. Casting references are optional and
// only meaningful when the target workflow actually accepts more than one
// image (`multiImageSupported`); when it doesn't, they are explicitly
// reported as "not sent" rather than silently dropped, and never appended to
// the mapping. `imageMappings`' order is exactly the order the caller must
// send images to the workflow in — this is the single source of truth for
// both the prompt text and the payload mapping.
// ---------------------------------------------------------------------------

import type { SequenceStoryboardReferenceInput } from "./buildSequenceStoryboardPrompt";

export type SequenceVideoPromptInput = {
  projectId: number;
  sequenceId: number;
  sequenceTitle: string | null;
  sequenceCode: string | null;
  /** Number of Shots in the Sequence, for the goal statement — not re-derived from packageText. */
  shotCount: number;
  /** Whether the target workflow can actually receive more than one image (Dynamic Batch / direct-repeatable inputs). When false, `references` are described but never mapped — the board is the only image sent. */
  multiImageSupported: boolean;
  /** Already ordered (selection order) and deduplicated by refId — this function never reorders references itself, only drops them entirely when `multiImageSupported` is false. */
  references: SequenceStoryboardReferenceInput[];
  /** formatSequenceGenerationPackageText(...) output — included verbatim inside a clearly delimited block. */
  packageText: string;
};

export type SequenceVideoImageMapping =
  | { refId: "board"; imageLabel: string; kind: "board" }
  | {
      refId: string;
      imageLabel: string;
      kind: "reference";
      assetId: number;
      assetName: string;
      assetType: string;
      roleLabel: string | null;
      variantState: string | null;
      approvedForGeneration: boolean;
    };

export type SequenceVideoPrompt = {
  text: string;
  /** [board, ...references] in exactly the order images must be sent to the workflow — @Image1 is always the board. */
  imageMappings: SequenceVideoImageMapping[];
  warnings: string[];
};

function dedupeByRefId(references: SequenceStoryboardReferenceInput[]): SequenceStoryboardReferenceInput[] {
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

export function buildSequenceVideoPrompt(input: SequenceVideoPromptInput): SequenceVideoPrompt {
  const warnings: string[] = [];
  if (input.shotCount === 0) {
    warnings.push("This Sequence has no Shots yet.");
  }

  const requestedReferences = dedupeByRefId(input.references);
  const references = input.multiImageSupported ? requestedReferences : [];
  if (!input.multiImageSupported && requestedReferences.length > 0) {
    warnings.push(
      `${requestedReferences.length} selected casting reference${requestedReferences.length !== 1 ? "s are" : " is"} not sent — this workflow accepts a single image (the Sequence Storyboard board only).`
    );
  }
  const unapproved = references.filter((r) => !r.approvedForGeneration);
  if (unapproved.length > 0) {
    warnings.push(
      `${unapproved.length} selected reference${unapproved.length !== 1 ? "s are" : " is"} not approved for generation.`
    );
  }

  const imageMappings: SequenceVideoImageMapping[] = [
    { refId: "board", imageLabel: "@Image1", kind: "board" },
    ...references.map((ref, i): SequenceVideoImageMapping => ({
      refId: ref.refId,
      imageLabel: `@Image${i + 2}`,
      kind: "reference",
      assetId: ref.assetId,
      assetName: ref.assetName,
      assetType: ref.assetType,
      roleLabel: ref.roleLabel,
      variantState: ref.variantState,
      approvedForGeneration: ref.approvedForGeneration,
    })),
  ];

  const sequenceHeaderParts = [
    `Project ${input.projectId} / Sequence ${input.sequenceId}`,
    input.sequenceCode ? `(${input.sequenceCode})` : null,
    input.sequenceTitle ? `— ${input.sequenceTitle}` : null,
  ].filter((p): p is string => Boolean(p));

  const goalLines = [
    "Sequence Video Prompt",
    sequenceHeaderParts.join(" "),
    "",
    `Goal: produce ONE continuous video realizing this Sequence's ${input.shotCount} Shot${
      input.shotCount !== 1 ? "s" : ""
    } in order, following the framing, action, camera and continuity described in the Sequence Generation Package below. @Image1 is the Sequence Storyboard board — use it as the visual PLAN for staging, framing and Shot order, never as a mosaic to reproduce frame-for-frame across the whole video. Include a clear transition or cut between each Shot's segment so the result can later be split back into individual Shot clips. Do not merge, skip, duplicate or reorder Shots.`,
  ];

  const castingLines: string[] = [];
  if (references.length > 0) {
    castingLines.push("", "Casting References:");
    for (const m of imageMappings) {
      if (m.kind !== "reference") continue;
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
