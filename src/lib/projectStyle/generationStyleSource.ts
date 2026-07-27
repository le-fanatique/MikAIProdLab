// ---------------------------------------------------------------------------
// generationStyleSource.ts — STYLE.1.E.CORE.1 (retake Round 1)
//
// The PURE half of the canonical generation Style source: consumer
// vocabulary, applicability grammar, consumer-aware sparse compilation,
// composition, exact size accounting and the provenance shape. No DB,
// filesystem or network import of any kind — a Client Component can safely
// import this module (e.g. for a live compiled-Style preview) without ever
// traversing the server/database module graph.
//
// The DB-backed orchestration (`resolveGenerationStyle`, which resolves a
// Project/Sequence/Shot target through the existing resolvers) lives in the
// separate `import "server-only"`-guarded
// src/lib/projectStyle/generationStyleResolver.ts — see codex_review.md
// Round 1, P1 "Pure contracts are coupled to the database/server graph".
//
// This ticket only builds the contract — no generation action, payload,
// preview or ComfyUI queue is touched here (STYLE.1.E.SURFACES.1 owns that
// rollout).
// ---------------------------------------------------------------------------

import type { StyleSnapshot } from "./styleSnapshot";
import { compileStyleSnapshot } from "./compileStyleSnapshot";

// ---------------------------------------------------------------------------
// Generation consumers — one closed, runtime-validated contract.
// ---------------------------------------------------------------------------

export const GENERATION_CONSUMERS = [
  "asset",
  "shot-image",
  "shot-video",
  "shot-storyboard",
  "sequence-storyboard",
  "sequence-video",
] as const;

export type GenerationConsumer = (typeof GENERATION_CONSUMERS)[number];

export function isGenerationConsumer(value: unknown): value is GenerationConsumer {
  return typeof value === "string" && (GENERATION_CONSUMERS as readonly string[]).includes(value);
}

export type ParseGenerationConsumerResult = { ok: true; consumer: GenerationConsumer } | { ok: false; error: string };

/** Never trusts a caller-supplied consumer value — refuses anything outside the closed list instead of silently defaulting. Accepts `unknown` deliberately: a compile-time `GenerationConsumer` type on a caller's variable does not guarantee the value was actually validated at runtime (e.g. after crossing a Server Action boundary or a JSON round-trip), so the canonical resolver runs this check itself rather than trusting its own parameter type (codex_review.md Round 1, P2). */
export function parseGenerationConsumer(value: unknown): ParseGenerationConsumerResult {
  if (isGenerationConsumer(value)) return { ok: true, consumer: value };
  return { ok: false, error: "Invalid generation consumer." };
}

const VIDEO_CONSUMERS: ReadonlySet<GenerationConsumer> = new Set(["shot-video", "sequence-video"]);

export type GenerationMediaType = "image" | "video";

export function consumerMediaType(consumer: GenerationConsumer): GenerationMediaType {
  return VIDEO_CONSUMERS.has(consumer) ? "video" : "image";
}

// ---------------------------------------------------------------------------
// Target-kind coherence — pure, so an invalid consumer/target pairing is
// rejected before the server orchestration ever considers a DB read
// (codex_review.md Round 1, P2). Each consumer requires exactly one target
// kind; the two Sequence-wide consumers (`sequence-storyboard`,
// `sequence-video`) never accept a Shot target, and the three Shot-specific
// consumers never accept a bare Sequence target.
// ---------------------------------------------------------------------------

export type GenerationStyleTargetKind = "project" | "sequence" | "shot";

export type GenerationStyleTarget =
  | { kind: "project"; projectId: number }
  | { kind: "sequence"; projectId: number; sequenceId: number }
  | { kind: "shot"; projectId: number; sequenceId: number; shotId: number };

export function requiredGenerationStyleTargetKind(consumer: GenerationConsumer): GenerationStyleTargetKind {
  switch (consumer) {
    case "asset":
      return "project";
    case "shot-image":
    case "shot-video":
    case "shot-storyboard":
      return "shot";
    case "sequence-storyboard":
    case "sequence-video":
      return "sequence";
  }
}

// ---------------------------------------------------------------------------
// Applicability — deterministic grammar over the existing nullable free-text
// `applicability` field. Real data includes natural language such as
// "Night interiors"; this never attempts semantic/LLM matching and never
// silently excludes such legacy content (docs/ARCHITECTURE_DECISIONS.md).
// ---------------------------------------------------------------------------

const ALL_SELECTOR = "all";

function recognizedSelectors(): ReadonlySet<string> {
  const set = new Set<string>([ALL_SELECTOR, "media:image", "media:video"]);
  for (const consumer of GENERATION_CONSUMERS) set.add(`consumer:${consumer}`);
  return set;
}

const RECOGNIZED_SELECTORS = recognizedSelectors();

/**
 * Grammar:
 *   - blank/null -> applies to all;
 *   - tokens are comma/semicolon separated and case-insensitive;
 *   - only `consumer:<...>`, `media:image`, `media:video` and `all` are
 *     machine-readable selectors;
 *   - no recognized selector among the tokens -> applies to all (backward
 *     compatible with existing free text like "Night interiors");
 *   - at least one recognized selector -> included only when one of them
 *     matches the current consumer or its media type.
 * `applicability` itself is never emitted as prompt prose — this function
 * only returns a boolean.
 */
export function isApplicableToConsumer(applicability: string | null | undefined, consumer: GenerationConsumer): boolean {
  const raw = applicability?.trim();
  if (!raw) return true;

  const tokens = raw
    .split(/[,;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return true;

  const recognized = tokens.filter((token) => RECOGNIZED_SELECTORS.has(token));
  if (recognized.length === 0) return true;

  const media = consumerMediaType(consumer);
  return recognized.some((token) => token === ALL_SELECTOR || token === `consumer:${consumer}` || token === `media:${media}`);
}

// ---------------------------------------------------------------------------
// Sparse, consumer-aware generation segment.
//
// Retake Round 1 (P1 "erases the two product pillars"): this now filters
// the snapshot's rules for the consumer and then reuses
// `compileStyleSnapshot()` unchanged on that filtered snapshot, instead of
// reimplementing a second pillar compiler that dropped the
// "Direction Brief:" / "World & Design Language:" / "Visual Treatment:" /
// "Style Rules:" structural labels. Those labels are exactly what lets a
// generation prompt distinguish a fictional-world rule from a
// visual-representation rule when both pillars are populated — the
// single-line sparse example in docs/PROJECT_STYLE_MVP_SPEC.md §10 does not
// authorize erasing that structure from a richer Style. Only a single
// literal "PROJECT STYLE" line is added on top, identifying the segment as
// a distinct source. No internal id, provenance note, applicability text or
// status ever enters this output — `compileStyleSnapshot` already omits
// every empty field/heading and disabled rule, so this function reuses that
// guarantee rather than re-deriving it.
// ---------------------------------------------------------------------------

/** Pure. Same snapshot always yields the exact same string — no DB, no clock, no randomness. Returns `""` when the consumer-filtered Style has no content at all. */
export function compileGenerationStyleSegment(snapshot: StyleSnapshot, consumer: GenerationConsumer): string {
  const filtered: StyleSnapshot = {
    directionBrief: snapshot.directionBrief,
    world: snapshot.world,
    visual: snapshot.visual,
    rules: snapshot.rules.filter((rule) => isApplicableToConsumer(rule.applicability, consumer)),
  };

  const compiled = compileStyleSnapshot(filtered);
  if (!compiled) return "";
  return `PROJECT STYLE\n${compiled}`;
}

// ---------------------------------------------------------------------------
// Composition — byte-for-byte no-Style compatibility is the load-bearing
// guarantee here: existing generation behavior must stay unchanged when
// there is no effective Style. No prompt limit, truncation or Seedance
// compaction is introduced by this ticket.
// ---------------------------------------------------------------------------

/** Pure. `styleSegment === ""` returns `basePrompt` completely untouched (same reference-equal string), never a variant with trailing whitespace or a stray delimiter. */
export function composeGenerationPrompt(basePrompt: string, styleSegment: string): string {
  if (!styleSegment) return basePrompt;
  if (!basePrompt) return styleSegment;
  return `${basePrompt}\n\n${styleSegment}`;
}

// ---------------------------------------------------------------------------
// Prompt-size accounting — exact character and UTF-8 byte counts only.
// Never called "tokens": no tokenizer exists here or is fabricated.
//
// Retake Round 1 (P1 "not exact for all text and can diverge"):
//   - "characters" now counts Unicode CODE POINTS via `Array.from(text)`,
//     not `String.prototype.length` (UTF-16 code units) — a single
//     astral-plane character (e.g. most emoji) previously counted as 2.
//   - `composeAndAccountGenerationPrompt` derives the composed prompt
//     itself from `composeGenerationPrompt`, so a caller can no longer
//     account for a prompt string different from the one actually
//     produced/queued.
// ---------------------------------------------------------------------------

export type PromptSizeMeasurement = { characters: number; utf8Bytes: number };

function codePointCount(text: string): number {
  return Array.from(text).length;
}

/**
 * `TextEncoder` (WHATWG Encoding standard) instead of Node's `Buffer` —
 * `Buffer` is a Node global this module (deliberately importable by Client
 * Components, see the file header) cannot assume exists in a browser
 * (codex_review.md Round 2, P1). `TextEncoder` is a global in both Node 18+
 * and every browser, always encodes UTF-8, and replaces an unpaired
 * surrogate with U+FFFD (3 bytes) exactly like Node's own
 * `Buffer.from(text, "utf8")` already did — identical byte semantics, no
 * dependency added.
 */
const textEncoder = new TextEncoder();

function utf8ByteCount(text: string): number {
  return textEncoder.encode(text).length;
}

/** Pure. Exact Unicode code-point count and UTF-8 byte count for one piece of text — the single counting implementation reused by both the composed-prompt accounting below and generation provenance. */
export function measurePromptText(text: string): PromptSizeMeasurement {
  return { characters: codePointCount(text), utf8Bytes: utf8ByteCount(text) };
}

export type ComposedGenerationPrompt = {
  /** The exact prompt `composeGenerationPrompt(basePrompt, styleSegment)` produced — the same string these measurements describe. */
  prompt: string;
  base: PromptSizeMeasurement;
  style: PromptSizeMeasurement;
  composed: PromptSizeMeasurement;
};

/** Pure. Composes and measures in one operation so a surface can never separate the two (previously `accountPromptSize` accepted an arbitrary third "composed" string that could diverge from what `composeGenerationPrompt` would actually produce). */
export function composeAndAccountGenerationPrompt(basePrompt: string, styleSegment: string): ComposedGenerationPrompt {
  const prompt = composeGenerationPrompt(basePrompt, styleSegment);
  return {
    prompt,
    base: measurePromptText(basePrompt),
    style: measurePromptText(styleSegment),
    composed: measurePromptText(prompt),
  };
}

// ---------------------------------------------------------------------------
// Exact provenance — extends GenerationSnapshot (src/lib/comfy/
// generationSnapshot.ts) additively. No draft id, secret, binary, URL or
// mutable client state; every field here is server-resolved and frozen at
// queue time.
//
// Retake Round 1 (P2 "should be a discriminated union"): modeled as a union
// keyed by `resolutionMode` — each mode requires exactly its own identity
// fields, so e.g. `sequence-override` without an override id/revision, or a
// `project-version` carrying override fields, is unrepresentable.
//
// Retake Round 2 (P2 "does not fully forbid unrelated identity fields"):
// TypeScript's excess-property check only rejects a *fresh object literal*
// carrying an extra field — a value first held in a variable (e.g. built by
// spreading, or returned from a helper) skips that check entirely and could
// still structurally satisfy a narrower variant even while carrying a
// foreign identity field. Every variant below now explicitly declares each
// OTHER variant's identity fields as `?: never` — not merely omitted. A
// value whose inferred type carries a real (non-`undefined`) value on any
// of those fields is no longer assignable to that variant, literal or not.
// ---------------------------------------------------------------------------

type GenerationStyleProvenanceBase = {
  consumer: GenerationConsumer;
  /** The exact compiled segment actually used — byte-identical to what was injected into the prompt. */
  compiledSegment: string;
  characterCount: number;
  utf8ByteCount: number;
};

/** Every identity field used by ANY provenance variant — intersected with `?: never` overrides per variant below so foreign fields are structurally excluded, not merely unrequired. */
type GenerationStyleIdentityFieldsAllNever = {
  projectStyleVersionId?: never;
  projectStyleVersionNumber?: never;
  sequenceOverrideId?: never;
  sequenceOverrideRevision?: never;
  sourceProjectStyleVersionId?: never;
  sourceProjectStyleVersionNumber?: never;
};

export type ProjectVersionStyleProvenance = GenerationStyleProvenanceBase &
  Omit<GenerationStyleIdentityFieldsAllNever, "projectStyleVersionId" | "projectStyleVersionNumber"> & {
    resolutionMode: "project-version";
    projectStyleVersionId: number;
    projectStyleVersionNumber: number;
  };

export type InheritedProjectVersionStyleProvenance = GenerationStyleProvenanceBase &
  Omit<GenerationStyleIdentityFieldsAllNever, "projectStyleVersionId" | "projectStyleVersionNumber"> & {
    resolutionMode: "inherited-project-version";
    projectStyleVersionId: number;
    projectStyleVersionNumber: number;
  };

export type SequenceOverrideStyleProvenance = GenerationStyleProvenanceBase &
  Omit<
    GenerationStyleIdentityFieldsAllNever,
    "sequenceOverrideId" | "sequenceOverrideRevision" | "sourceProjectStyleVersionId" | "sourceProjectStyleVersionNumber"
  > & {
    resolutionMode: "sequence-override";
    sequenceOverrideId: number;
    sequenceOverrideRevision: number;
    sourceProjectStyleVersionId: number;
    sourceProjectStyleVersionNumber: number;
  };

export type GenerationStyleResolutionMode = GenerationStyleProvenance["resolutionMode"];

export type GenerationStyleProvenance = ProjectVersionStyleProvenance | InheritedProjectVersionStyleProvenance | SequenceOverrideStyleProvenance;
