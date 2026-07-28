"use server";

// ---------------------------------------------------------------------------
// assetAlignment.ts — STYLE.1.F.CORE (Retake Round 1)
//
// Server Actions for the explicit "Align with Project Style" flow:
//   - generateAssetAlignmentProposalAction: resolves the active Project
//     Style, builds the deterministic context, calls the LLM, strictly
//     parses the result, then RE-VALIDATES ownership/active-version/
//     fingerprint in one fresh transaction before returning — a race during
//     the LLM call (Style published, or the Asset edited, while it was
//     running) is refused as stale, never returned as if it were current.
//     Performs ZERO DB writes in every case.
//   - getAssetAlignmentStatusAction: read-only informational status
//     (no-active-style / not-reviewed / aligned / style-changed /
//     asset-changed / explicit corruption error). Never blocks generation.
//   - applyAssetAlignmentAction: the only mutation. Input is parsed by a
//     strict pure validator (applyValidation.ts) before anything else. One
//     synchronous transaction: ownership -> active-version re-check ->
//     fingerprint staleness check -> real-change / already-aligned-match
//     check -> field update (changes-proposed only) -> alignment marker
//     upsert. All-or-nothing; a real DB fault rolls back both the Asset
//     fields and the marker together.
//
// `assertStillCurrentSync` is the one shared "is this still the Asset/Style
// state we think it is" check, reused by generate's post-LLM-call
// revalidation and by Apply's own pre-write check — a race is caught the
// same way in both places.
//
// Concurrency: better-sqlite3 transactions run fully synchronously with no
// `await` inside their callback (same idiom as sequenceStyle.ts /
// projectStyle.ts), so two concurrent applies are fully serialized by the
// driver. The second one to run always re-reads a fresh fingerprint inside
// its own transaction — if the first already applied, the second's baseline
// fingerprint no longer matches and it is refused as stale. No extra locking
// is needed for "at most one winner".
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { assets, assetStyleAlignments, projectStyleVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { callLLMJson } from "@/lib/llm";
import { getLLMConfig } from "@/lib/settings";
import { isValidId } from "@/lib/projectStyle/validation";
import { readActiveProjectVersionSync, type Tx } from "@/lib/projectStyle/resolveSequenceStyle";
import { resolveAssetStyleContext } from "@/lib/projectStyle/assetAlignment/resolveAssetStyleContext";
import { resolveAssetAlignmentOwnership } from "@/lib/projectStyle/assetAlignment/resolveAssetAlignmentOwnership";
import { buildAssetAlignmentContext } from "@/lib/projectStyle/assetAlignment/alignmentContext";
import { buildAssetAlignmentPrompt } from "@/lib/prompts/asset-alignment-from-context";
import { parseAssetAlignmentProposalFromJson } from "@/lib/projectStyle/assetAlignment/validateProposal";
import { parseApplyAssetAlignmentInput, type ApplyAssetAlignmentInput } from "@/lib/projectStyle/assetAlignment/applyValidation";
import {
  computeAssetContentFingerprint,
  isWellFormedFingerprint,
  normalizeAlignmentFieldForStorage,
  type AssetAlignmentFingerprintInput,
} from "@/lib/projectStyle/assetAlignment/fingerprint";
import { isAssetAlignmentBaselineWithinBounds, type AssetAlignmentFieldValues, type AssetAlignmentProposal } from "@/lib/projectStyle/assetAlignment/contracts";

function assetRowToFingerprintInput(row: { description: string | null; notes: string | null; visualIdentity: string | null; usageRules: string | null; forbiddenVariations: string | null }): AssetAlignmentFingerprintInput {
  return {
    description: row.description,
    notes: row.notes,
    visualIdentity: row.visualIdentity,
    usageRules: row.usageRules,
    forbiddenVariations: row.forbiddenVariations,
  };
}

// ---------------------------------------------------------------------------
// Shared: "is this still the Asset/Style state we think it is" — the one
// place both generate's post-LLM-call revalidation and Apply's pre-write
// check read ownership, the active Style version, and the live Asset
// fingerprint from a single coherent transactional snapshot.
// ---------------------------------------------------------------------------

type StillCurrentOutcome =
  | { kind: "ownership"; error: string }
  | { kind: "resolver-error"; error: string }
  | { kind: "no-active-style" }
  | { kind: "style-changed"; currentVersionNumber: number }
  | { kind: "stale-asset" }
  | { kind: "ok"; asset: typeof assets.$inferSelect; activeVersion: { id: number; versionNumber: number } };

function assertStillCurrentSync(
  tx: Tx,
  projectId: number,
  assetId: number,
  expectedStyleVersionId: number,
  expectedFingerprint: string
): StillCurrentOutcome {
  const assetRows = tx.select().from(assets).where(eq(assets.id, assetId)).all() as unknown as (typeof assets.$inferSelect)[];
  const asset = assetRows[0];
  if (!asset || asset.projectId !== projectId) return { kind: "ownership", error: "Asset not found." };

  const activeRead = readActiveProjectVersionSync(tx, projectId);
  if (!activeRead.ok) return { kind: "resolver-error", error: activeRead.error };
  if (!activeRead.version) return { kind: "no-active-style" };
  if (activeRead.version.id !== expectedStyleVersionId) {
    return { kind: "style-changed", currentVersionNumber: activeRead.version.versionNumber };
  }

  const currentFingerprint = computeAssetContentFingerprint(assetRowToFingerprintInput(asset));
  if (currentFingerprint !== expectedFingerprint) return { kind: "stale-asset" };

  return { kind: "ok", asset, activeVersion: { id: activeRead.version.id, versionNumber: activeRead.version.versionNumber } };
}

// ---------------------------------------------------------------------------
// Generate — zero DB writes in every outcome.
// ---------------------------------------------------------------------------

export type GenerateAssetAlignmentProposalResult =
  | {
      ok: true;
      proposal: AssetAlignmentProposal;
      styleVersion: { id: number; versionNumber: number };
      baselineFingerprint: string;
      baseline: AssetAlignmentFieldValues;
    }
  | { ok: false; error: string; stale?: boolean };

export async function generateAssetAlignmentProposalAction(formData: FormData): Promise<GenerateAssetAlignmentProposalResult> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);
    if (!isValidId(projectId) || !isValidId(assetId)) {
      return { ok: false, error: "Invalid request." };
    }

    const ownership = await resolveAssetAlignmentOwnership(projectId, assetId);
    if (!ownership.ok) return ownership;

    // Refuse BEFORE any LLM call if a field is too long to show completely —
    // never truncate what the model sees, since Apply may overwrite the
    // complete field from that same (incomplete) view (Codex Round 1 P1).
    if (!isAssetAlignmentBaselineWithinBounds({ projectName: ownership.project.name, assetName: ownership.asset.name, fields: ownership.asset.fields })) {
      return { ok: false, error: "This Asset's name or one of its fields is too long to review for Style alignment. Shorten it and try again." };
    }

    // Explicit alignment generation refuses BEFORE any LLM call when there
    // is no active Style — never a silent unstyled fallback.
    const styleResolved = await resolveAssetStyleContext(projectId);
    if (!styleResolved.ok) return { ok: false, error: styleResolved.error };
    if (styleResolved.context.mode === "none") {
      return { ok: false, error: "There is no active published Project Style to align this Asset against." };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const styleVersionId = styleResolved.context.projectStyleVersionId;
    const styleVersionNumber = styleResolved.context.projectStyleVersionNumber;
    const baselineFingerprint = computeAssetContentFingerprint(ownership.asset.rawFields);

    const context = buildAssetAlignmentContext({
      project: ownership.project,
      asset: { name: ownership.asset.name, type: ownership.asset.type, ...ownership.asset.fields },
      style: styleResolved.context.segments,
    });

    const prompt = buildAssetAlignmentPrompt(context);
    const raw = await callLLMJson(prompt, config);
    const parsed = parseAssetAlignmentProposalFromJson(raw, ownership.asset.fields);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    // Codex Round 1 P1 — the LLM call can take seconds; the active Style or
    // the Asset itself may have changed while it ran. Re-validate in one
    // fresh transaction before ever returning this proposal as current.
    let revalidation: StillCurrentOutcome;
    try {
      revalidation = db.transaction((tx) => assertStillCurrentSync(tx, projectId, assetId, styleVersionId, baselineFingerprint));
    } catch {
      return { ok: false, error: "A database error occurred while validating this proposal. Please try again." };
    }
    if (revalidation.kind === "ownership") return { ok: false, error: revalidation.error };
    if (revalidation.kind === "resolver-error") return { ok: false, error: revalidation.error };
    if (revalidation.kind === "no-active-style" || revalidation.kind === "style-changed") {
      return {
        ok: false,
        stale: true,
        error: "The active Project Style changed while this proposal was being generated. Reload and try again.",
      };
    }
    if (revalidation.kind === "stale-asset") {
      return {
        ok: false,
        stale: true,
        error: "This Asset was changed elsewhere while this proposal was being generated. Reload and try again.",
      };
    }

    return {
      ok: true,
      proposal: parsed.proposal,
      styleVersion: { id: styleVersionId, versionNumber: styleVersionNumber },
      baselineFingerprint,
      baseline: ownership.asset.fields,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unexpected error. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Read model — informational only, never blocks generation.
// ---------------------------------------------------------------------------

export type AssetAlignmentStatus =
  | { kind: "no-active-style" }
  | { kind: "not-reviewed"; activeStyleVersionNumber: number }
  | { kind: "aligned"; styleVersionNumber: number }
  | { kind: "style-changed"; reviewedStyleVersionNumber: number; activeStyleVersionNumber: number }
  | { kind: "asset-changed"; styleVersionNumber: number };

export type GetAssetAlignmentStatusResult = { ok: true; status: AssetAlignmentStatus } | { ok: false; error: string };

/** One synchronous transaction — ownership, active pointer/version, marker row and the marker's own reviewed version, and the Asset's live fields are all read from the same point in time. A marker referencing a missing/cross-Project version, or carrying a malformed fingerprint, is an explicit corruption error — never masked as a normal status (Codex Round 1 P1). */
function getAssetAlignmentStatusSync(tx: Tx, projectId: number, assetId: number): GetAssetAlignmentStatusResult {
  const assetRows = tx
    .select()
    .from(assets)
    .where(eq(assets.id, assetId))
    .all() as unknown as (typeof assets.$inferSelect)[];
  const asset = assetRows[0];
  if (!asset || asset.projectId !== projectId) return { ok: false, error: "Asset not found." };

  const activeRead = readActiveProjectVersionSync(tx, projectId);
  if (!activeRead.ok) return { ok: false, error: activeRead.error };
  if (!activeRead.version) return { ok: true, status: { kind: "no-active-style" } };

  const markerRows = tx
    .select()
    .from(assetStyleAlignments)
    .where(eq(assetStyleAlignments.assetId, assetId))
    .all() as unknown as (typeof assetStyleAlignments.$inferSelect)[];
  const marker = markerRows[0];

  if (!marker) {
    return { ok: true, status: { kind: "not-reviewed", activeStyleVersionNumber: activeRead.version.versionNumber } };
  }

  if (!isWellFormedFingerprint(marker.assetContentFingerprint)) {
    return { ok: false, error: "The stored Style alignment review is corrupted." };
  }

  if (marker.projectStyleVersionId !== activeRead.version.id) {
    const reviewedVersionRows = tx
      .select()
      .from(projectStyleVersions)
      .where(eq(projectStyleVersions.id, marker.projectStyleVersionId))
      .all() as unknown as (typeof projectStyleVersions.$inferSelect)[];
    const reviewedVersion = reviewedVersionRows[0];
    if (!reviewedVersion) {
      return { ok: false, error: "The Style alignment review references a Style version that no longer exists." };
    }
    if (reviewedVersion.projectId !== projectId) {
      return { ok: false, error: "The Style alignment review references a Style version belonging to a different Project." };
    }
    return {
      ok: true,
      status: {
        kind: "style-changed",
        reviewedStyleVersionNumber: reviewedVersion.versionNumber,
        activeStyleVersionNumber: activeRead.version.versionNumber,
      },
    };
  }

  const liveFingerprint = computeAssetContentFingerprint(assetRowToFingerprintInput(asset));
  if (liveFingerprint !== marker.assetContentFingerprint) {
    return { ok: true, status: { kind: "asset-changed", styleVersionNumber: activeRead.version.versionNumber } };
  }

  return { ok: true, status: { kind: "aligned", styleVersionNumber: activeRead.version.versionNumber } };
}

export async function getAssetAlignmentStatusAction(projectId: number, assetId: number): Promise<GetAssetAlignmentStatusResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  if (!isValidId(assetId)) return { ok: false, error: "Invalid asset id." };

  try {
    return db.transaction((tx) => getAssetAlignmentStatusSync(tx, projectId, assetId));
  } catch {
    return { ok: false, error: "A database error occurred while loading the Style alignment status. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Apply — the only mutation.
// ---------------------------------------------------------------------------

export type ApplyAssetAlignmentResult = { ok: true; styleVersionNumber: number } | { ok: false; error: string };

type ApplyOutcome =
  | { kind: "ownership"; error: string }
  | { kind: "resolver-error"; error: string }
  | { kind: "no-active-style" }
  | { kind: "style-changed"; currentVersionNumber: number }
  | { kind: "stale-asset" }
  | { kind: "no-real-change" }
  | { kind: "fields-mismatch" }
  | { kind: "ok"; styleVersionNumber: number };

const GENERIC_DB_FAULT_ERROR = "A database error occurred while applying the Style alignment. Please try again.";

/** The raw "bytes actually stored" view of the five editable fields — used ONLY as the already-aligned post-review fingerprint input (Codex Round 2 P1: that marker must hash what is actually stored when no Asset write occurs, never a normalized stand-in for it). */
function assetRowToRawFields(row: { description: string | null; notes: string | null; visualIdentity: string | null; usageRules: string | null; forbiddenVariations: string | null }) {
  return {
    description: row.description,
    notes: row.notes,
    visualIdentity: row.visualIdentity,
    usageRules: row.usageRules,
    forbiddenVariations: row.forbiddenVariations,
  };
}

/**
 * The canonical, NORMALIZED "what does the DB currently hold" view — the
 * exact representation Apply's real-change / already-aligned-match checks
 * compare against. Codex Round 2 P1: comparing normalized submitted fields
 * against the RAW (unnormalized) DB row let a stray leading/trailing space
 * or an empty-string-vs-null distinction in old data masquerade as a real
 * change, and rejected a legitimate no-op `already-aligned` apply. This
 * applies the exact same `normalizeAlignmentFieldForStorage` used for
 * submitted fields, so both sides of every comparison are canonical.
 */
function assetRowToNormalizedFields(row: { description: string | null; notes: string | null; visualIdentity: string | null; usageRules: string | null; forbiddenVariations: string | null }) {
  return {
    description: normalizeAlignmentFieldForStorage(row.description ?? ""),
    notes: normalizeAlignmentFieldForStorage(row.notes ?? ""),
    visualIdentity: normalizeAlignmentFieldForStorage(row.visualIdentity ?? ""),
    usageRules: normalizeAlignmentFieldForStorage(row.usageRules ?? ""),
    forbiddenVariations: normalizeAlignmentFieldForStorage(row.forbiddenVariations ?? ""),
  };
}

function applyAssetAlignmentSync(tx: Tx, input: ApplyAssetAlignmentInput): ApplyOutcome {
  const current = assertStillCurrentSync(tx, input.projectId, input.assetId, input.expectedStyleVersionId, input.baselineFingerprint);
  if (current.kind !== "ok") return current;

  // Defensive: the client-declared version NUMBER must match the id it
  // claims to be — a mismatch here means a forged/stale pairing even though
  // the id itself resolved.
  if (current.activeVersion.versionNumber !== input.expectedStyleVersionNumber) {
    return { kind: "style-changed", currentVersionNumber: current.activeVersion.versionNumber };
  }

  const normalizedInput = {
    description: normalizeAlignmentFieldForStorage(input.fields.description),
    notes: normalizeAlignmentFieldForStorage(input.fields.notes),
    visualIdentity: normalizeAlignmentFieldForStorage(input.fields.visualIdentity),
    usageRules: normalizeAlignmentFieldForStorage(input.fields.usageRules),
    forbiddenVariations: normalizeAlignmentFieldForStorage(input.fields.forbiddenVariations),
  };
  const currentNormalized = assetRowToNormalizedFields(current.asset);
  const hasRealChange = (Object.keys(normalizedInput) as (keyof typeof normalizedInput)[]).some(
    (field) => normalizedInput[field] !== currentNormalized[field]
  );

  // Codex Round 1 P1 — the strict LLM proposal parser only validated the
  // model's OWN output; the client is free to edit the proposal before
  // Apply, so Apply must independently enforce the same two invariants at
  // its own boundary: a "changes-proposed" apply must contain a real
  // post-normalization change, and an "already-aligned" apply's fields must
  // still match the Asset's current canonical (normalized) values — Codex
  // Round 2 P1: both sides of this comparison must be normalized the same
  // way, never normalized-input-vs-raw-DB-row.
  if (input.outcome === "changes-proposed" && !hasRealChange) return { kind: "no-real-change" };
  if (input.outcome === "already-aligned" && hasRealChange) return { kind: "fields-mismatch" };

  const now = new Date().toISOString();
  // already-aligned performs no Asset write, so its marker must hash the
  // RAW bytes actually stored — never the normalized comparison view above
  // (Codex Round 2 P1, fix step 3).
  let postFingerprint = computeAssetContentFingerprint(assetRowToRawFields(current.asset));

  if (input.outcome === "changes-proposed") {
    tx.update(assets).set({ ...normalizedInput, updatedAt: now }).where(eq(assets.id, input.assetId)).run();
    postFingerprint = computeAssetContentFingerprint(normalizedInput);
  }
  // outcome === "already-aligned": zero Asset field writes, unchanged updatedAt.

  tx.insert(assetStyleAlignments)
    .values({
      assetId: input.assetId,
      projectStyleVersionId: current.activeVersion.id,
      assetContentFingerprint: postFingerprint,
      reviewedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: assetStyleAlignments.assetId,
      set: { projectStyleVersionId: current.activeVersion.id, assetContentFingerprint: postFingerprint, reviewedAt: now },
    })
    .run();

  return { kind: "ok", styleVersionNumber: current.activeVersion.versionNumber };
}

/** `rawInput` is untrusted — parsed by `parseApplyAssetAlignmentInput` (exact shape, exact bounds, no prototype/extra-key tolerance) before anything else touches it. */
export async function applyAssetAlignmentAction(rawInput: unknown): Promise<ApplyAssetAlignmentResult> {
  const parsed = parseApplyAssetAlignmentInput(rawInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.input;

  let outcome: ApplyOutcome;
  try {
    outcome = db.transaction((tx) => applyAssetAlignmentSync(tx, input));
  } catch {
    return { ok: false, error: GENERIC_DB_FAULT_ERROR };
  }

  if (outcome.kind === "ownership") return { ok: false, error: outcome.error };
  if (outcome.kind === "resolver-error") return { ok: false, error: outcome.error };
  if (outcome.kind === "no-active-style") {
    return { ok: false, error: "There is no active published Project Style to apply this review against." };
  }
  if (outcome.kind === "style-changed") {
    return {
      ok: false,
      error: `The active Project Style changed to version ${outcome.currentVersionNumber} while this review was open. Reload and try again.`,
    };
  }
  if (outcome.kind === "stale-asset") {
    return { ok: false, error: "This Asset was changed elsewhere since this review started. Reload and try again." };
  }
  if (outcome.kind === "no-real-change") {
    return { ok: false, error: "No field actually changed from the current value. Nothing to apply." };
  }
  if (outcome.kind === "fields-mismatch") {
    return { ok: false, error: "The submitted values do not match the Asset's current fields. Reload and try again." };
  }

  return { ok: true, styleVersionNumber: outcome.styleVersionNumber };
}
