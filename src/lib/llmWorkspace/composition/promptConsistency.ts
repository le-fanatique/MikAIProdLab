// ---------------------------------------------------------------------------
// composition/promptConsistency.ts — PROMPT.DOCTOR.1, Part A
//
// Six deterministic, no-model checks on the composed Shot prompt. The first
// five were lifted from a defect the author actually hit on his own composed
// prompt (2026-08-26): a cast Asset described in Subject but never named in
// Subject Definition (`Corporate Corridors`, `Sensor Console`), the same
// description repeated between General Description and Action, a cast Asset
// never named in the action text, a cast Asset with neither a Prompt Card
// nor a reference image, and a Shot with no `Lighting:` part despite the
// resolution chain having environment candidates to draw from. The sixth
// (SHOTPROMPT.REFS.2) is this check's own mirror: an image actually sent to
// the engine but explained by nothing at all — no asset name, no named mode,
// no note.
//
// **Why this is not `guideDefault.inspect`.** `guideDefault` (B13a/B13b) is
// the *engine's* norm — replaceable per engine, and
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.6 forbids it from ever learning
// the shape of *our own* composition (Subject/Action/Environment/…, cast
// Assets, Subject Definition lines). These six checks are internal
// consistency of the composer's own parts against the composer's own cast —
// they would still make sense with no engine profile at all, and they belong
// beside the compositor, not inside a profile
// (`docs/WHERE_THE_RULES_LIVE.md`: "which module owns it?").
//
// **Same shape, second source.** The result is the same three-field shape
// `ConformationFinding` already has (`code`, `severity`, `message`) so the one
// existing renderer (the Sequence Storyboard generate page's "Findings —
// informational, never blocking" block) can show both sources merged,
// without a second display being built. The `code` union is deliberately its
// own, not `ConformationFindingCode` — these are not engine output-discipline
// codes, and widening that closed union would be exactly the mistake §5.6
// warns against in the other direction.
//
// **Assembly, not cooking** (§5.3): pure, deterministic, no model, no
// database — recomputed on demand from what the caller already has. No
// `import "server-only"`.
//
// **Never blocking** (§5.4): every finding is `"info"` or `"warn"`, exactly
// like `guideDefault`'s own two severities. Nothing here refuses to compose.
// ---------------------------------------------------------------------------

import type { PromptCompilationContext } from "@/lib/prompts/buildPromptCompilationContext";
import { getGuideModeForRole } from "@/lib/llmWorkspace/conformation/profiles/guideDefault";
import type { StoryboardShotComposition } from "./storyboardShot";

export type PromptConsistencyFindingCode =
  | "subjectNotDeclared"
  | "duplicateText"
  | "castAssetNotNamed"
  | "assetWithoutAnchor"
  | "lightingChainUnused"
  | "imageSentUnexplained";

/** Same shape as `ConformationFinding` on purpose — see this module's own header. */
export type PromptConsistencyFinding = {
  code: PromptConsistencyFindingCode;
  severity: "info" | "warn";
  message: string;
};

export type PromptConsistencyCheckInput = {
  /** The already-composed Shot — `composeStoryboardShot`'s own output, never recomputed here. */
  composition: StoryboardShotComposition;
  /** The already-resolved pantry, the same one handed to `composeStoryboardShot`. */
  context: PromptCompilationContext;
  /**
   * Check 5's only piece of information this module cannot derive from
   * `composition`/`context` alone: whether the lighting resolution chain
   * (`resolveStoryboardLighting`, `resolveSequenceEnvironmentAssets`) had at
   * least one Environment Asset cast into the Sequence to draw lighting from,
   * even though the Shot's own resolved lighting ended up empty. The caller
   * already runs that resolution and reads no database twice for it — this
   * module stays pure. Defaults to `false`: a caller that says nothing gets
   * no finding, never a wrong one (the same contract `isGuideMonoPlanFormula`
   * follows in `ConformationInspectionRequest`).
   */
  lightingChainHadUnusedCandidate?: boolean;
};

/** Trim + lowercase, for name/fragment comparison that is not byte-exact. */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Collapses internal whitespace too, for fragment-level comparison. */
function normalizeFragment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Splits a string into lowercased word tokens, dropping punctuation. Used by
 * `hasSignificantWordMatch` below — never a linguistic tokenizer, just enough
 * to compare a name's words against an action sentence's own words.
 */
function wordTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * A word and its naive singular/plural counterpart — "console" <-> "consoles".
 * Deliberately not a stemmer: an `s` suffix is the one pluralization the
 * ticket asks this check to tolerate, nothing more.
 */
function wordForms(word: string): string[] {
  if (word.endsWith("s") && word.length > 3) {
    return [word, word.slice(0, -1)];
  }
  return [word, `${word}s`];
}

/**
 * PROMPT.DOCTOR.2 — check 3's actual match: does **any** significant word of
 * `name` (case- and plural-insensitive) appear in `text`? Not a similarity
 * engine — the ticket is explicit that a simple word-level match is enough,
 * and the author's own case is what it is built to pass: `name` is
 * "Sensor Console", `text` contains "...the failing consoles...", and
 * "console"/"consoles" is the shared word.
 */
function hasSignificantWordMatch(name: string, text: string): boolean {
  const textWords = new Set(wordTokens(text));
  return wordTokens(name).some((word) => wordForms(word).some((form) => textWords.has(form)));
}

/**
 * Splits a composed part's text into sentence/line-sized fragments. Not a
 * linguistic tokenizer — the guide's own `countWords` in `guideDefault.ts`
 * makes the same choice for the same reason: a precise measure does not
 * exist here, and an approximate one that catches the real defect (a whole
 * description sentence copied into Action) is what is needed.
 */
function splitFragments(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);
}

/**
 * Below this length a fragment is generic enough ("she walks in", "he
 * turns") that two parts sharing it is not a sign either copied the other —
 * the ticket's own instruction: "un fragment court et générique ne doit pas
 * déclencher un finding".
 */
const DUPLICATE_FRAGMENT_MIN_LENGTH = 30;

function partText(composition: StoryboardShotComposition, id: string): string | null {
  const part = composition.parts.find((p) => p.id === id);
  return part ? part.text : null;
}

export function checkPromptConsistency(input: PromptConsistencyCheckInput): PromptConsistencyFinding[] {
  const { composition, context } = input;
  const findings: PromptConsistencyFinding[] = [];

  const subjectDefinitionNames = new Set(
    context.references
      .filter((ref) => ref.source === "asset" && ref.assetName)
      .map((ref) => normalizeKey(ref.assetName as string))
  );

  // Check 1 — subject described but not declared: a cast Asset (rendered in
  // `Subject:`) that has no line in Subject Definition (no reference image
  // carrying its name), e.g. an Environment cast without ever being anchored
  // to an image.
  for (const asset of context.castAssets) {
    if (!subjectDefinitionNames.has(normalizeKey(asset.assetName))) {
      findings.push({
        code: "subjectNotDeclared",
        severity: "info",
        message: `"${asset.assetName}" is described in Subject but has no reference image, so no Subject Definition line names it.`,
      });
    }
  }

  // Check 2 — the same text repeated between General Description and Action.
  const generalDescriptionText = partText(composition, "generalDescription");
  const actionText = partText(composition, "action");
  if (generalDescriptionText && actionText) {
    const actionFragments = new Set(
      splitFragments(actionText)
        .map(normalizeFragment)
        .filter((fragment) => fragment.length >= DUPLICATE_FRAGMENT_MIN_LENGTH)
    );
    const seen = new Set<string>();
    for (const rawFragment of splitFragments(generalDescriptionText)) {
      const fragment = normalizeFragment(rawFragment);
      if (fragment.length < DUPLICATE_FRAGMENT_MIN_LENGTH) continue;
      if (!actionFragments.has(fragment) || seen.has(fragment)) continue;
      seen.add(fragment);
      findings.push({
        code: "duplicateText",
        severity: "warn",
        message: `"${rawFragment.trim()}" appears in both General Description and Action — the same text is repeated between two parts.`,
      });
    }
  }

  // Check 3 — a cast Asset never named in the action text. PROMPT.DOCTOR.2:
  // a partial, word-level match, tolerant to plural and case
  // (`hasSignificantWordMatch`) — an author almost never writes an asset's
  // exact card name in a sentence of action ("scans the failing consoles"
  // for a "Sensor Console"), and the exact-substring match this used to run
  // fired on that real case.
  if (actionText && actionText.trim().length > 0) {
    for (const asset of context.castAssets) {
      if (!hasSignificantWordMatch(asset.assetName, actionText)) {
        findings.push({
          code: "castAssetNotNamed",
          severity: "info",
          message: `"${asset.assetName}" is cast in this Shot but is never named in the Action text.`,
        });
      }
    }
  }

  // Check 4 — a cast Asset described but with no anchor at all: no Prompt
  // Card and no reference image.
  for (const asset of context.castAssets) {
    const hasPromptCard = Boolean(asset.assetBible?.promptCard);
    const hasReferenceImage = subjectDefinitionNames.has(normalizeKey(asset.assetName));
    if (!hasPromptCard && !hasReferenceImage) {
      findings.push({
        code: "assetWithoutAnchor",
        severity: "warn",
        message: `"${asset.assetName}" has neither a Prompt Card nor a reference image — it is described but has no visual anchor.`,
      });
    }
  }

  // Check 5 — no Lighting part despite the resolution chain having material.
  const hasLightingPart = composition.parts.some((p) => p.id === "lighting");
  if (!hasLightingPart && input.lightingChainHadUnusedCandidate) {
    findings.push({
      code: "lightingChainUnused",
      severity: "info",
      message:
        "No Lighting part is rendered, even though the Sequence has Environment Assets that could have supplied one.",
    });
  }

  // Check 6 — SHOTPROMPT.REFS.2: an image is actually sent (has an @ImageN
  // tag, i.e. is in `context.references`) but nothing explains what it is
  // for — no casting asset name, no named mode, and no free-text note.
  // Deliberately never fires when any one of the three exists: an asset with
  // a name, a reference with a named role (`getGuideModeForRole`), or a
  // reference carrying a note is already explained, exactly the discipline
  // PROMPT.DOCTOR.2 restored for check 3 after it fired on normal cases.
  for (const ref of context.references) {
    const hasName = ref.source === "asset" && Boolean(ref.assetName);
    const hasMode = getGuideModeForRole(ref.role) !== null;
    const hasNote = Boolean(ref.note && ref.note.trim());
    if (!hasName && !hasMode && !hasNote) {
      findings.push({
        code: "imageSentUnexplained",
        severity: "info",
        message: `${ref.tag} is sent to the engine but has no asset name, no named mode and no note — nothing explains what it is for.`,
      });
    }
  }

  return findings;
}
