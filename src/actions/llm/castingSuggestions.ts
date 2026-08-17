"use server";

import { db } from "@/db";
import { sequences, shots, assets, shotAssets, sequenceAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { GeneratedCastingSuggestion } from "@/types/llm";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { castingFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/castingFromSequence";
import { mapListItemToModelKeys } from "@/lib/llmWorkspace/benchRun";

const VALID_ASSET_TYPES = [
  "character",
  "environment",
  "prop",
  "vehicle",
  "crowd",
  "other",
] as const;
type AssetType = (typeof VALID_ASSET_TYPES)[number];

function normalizeAssetType(raw: unknown): AssetType {
  if (typeof raw === "string" && (VALID_ASSET_TYPES as readonly string[]).includes(raw)) {
    return raw as AssetType;
  }
  return "other";
}

function normalizeConfidence(
  raw: unknown
): "high" | "medium" | "low" {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function str(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, maxLen) : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  return null;
}

type RawSuggestion = {
  targetType: "sequence" | "shot";
  targetId: number;
  targetLabel: string;
  assetId: number;
  assetName: string;
  assetType: AssetType;
  reason: string | null;
  confidence: "high" | "medium" | "low";
};

function normalizeRawSuggestion(raw: unknown): RawSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const targetType =
    r.targetType === "sequence" || r.targetType === "shot" ? r.targetType : null;
  if (!targetType) return null;

  const targetId = num(r.targetId);
  if (!targetId) return null;

  const assetId = num(r.assetId);
  if (!assetId) return null;

  const targetLabel = str(r.targetLabel, 200) ?? "";
  const assetName = str(r.assetName, 200) ?? "";

  return {
    targetType,
    targetId,
    targetLabel,
    assetId,
    assetName,
    assetType: normalizeAssetType(r.assetType),
    reason: str(r.reason, 300),
    confidence: normalizeConfidence(r.confidence),
  };
}

/**
 * Thin adapter over `runOperation(castingFromSequenceDescriptor, ...)`
 * (LLMW.MIGRATE.LIST.4, B7h-m), on the same model
 * `generateShotsFromSequenceDraft` (`src/actions/llm/sequenceShots.ts`,
 * post-B7e) and `generateAssetCandidatesDraft`
 * (`src/actions/llm/assetExtraction.ts`, post-B7f-m) already reproduce: keeps
 * the exact `{ok:true, suggestions}` return shape `CastingSuggestionsPanel`
 * depends on. The panel sends three form fields
 * (`CastingSuggestionsPanel.tsx:56-59`); converting the one boolean the
 * descriptor declares (`includeSequenceLevel`) is this adapter's own job —
 * the panel is not touched.
 *
 * PIÈGE 1 (A.2 of the ticket): `alreadyAssigned` is a `postResponse`-computed
 * boolean (`castingFromSequence.filterAndEnrich`, `variables/registry.ts`),
 * never declared on `castingFromSequenceDescriptor.output.item.fields` — so
 * `mapListItemToModelKeys`, which only translates declared fields, silently
 * drops it. Read directly off the runner's own item instead, and refuse
 * loudly if it is ever not the boolean the form always attaches — the same
 * "impossible input throws" discipline `generateShotsFromSequenceDraft`
 * already applies to an unexpected boolean it does *not* expect.
 *
 * PIÈGE 2 (A.3): `readStringField` (`runner.ts`) renders `""` where the old
 * `str()` rendered `null`. Unlike `generateAssetCandidatesDraft`'s blanket
 * loop over every `type: "string"` field, that fill-back applies to `reason`
 * alone here: `GeneratedCastingSuggestion` declares `targetLabel: string` and
 * `assetName: string` — non-nullable — and the old chain's own enriched
 * value (never `str()`) rendered `""` for a titleless, code-less shot
 * (`castingSuggestions.ts:252-258` pre-migration), not `null`. Only `reason`
 * is declared `string | null`. `assetType`/`confidence` are `type: "enum"`
 * fields with a mandatory `default` — `readEnumField` always returns one of
 * their valid members, never `""`, so neither needs filling. `targetId`/
 * `assetId` are `fallback: "omit"`, but every item that survives the
 * `postResponse` form already carries both (the form filters on their
 * existence, `variables/registry.ts:939-942`) — read directly, and throw if
 * either is somehow missing rather than guess a value with no oracle to
 * justify one.
 *
 * PIÈGE 3 (A.4): `normalizeRawSuggestion` and its dependencies stay — they
 * are read by `applySelectedCastingSuggestions` below, the write side this
 * adapter does not touch.
 *
 * A.5 — the declared divergence (corrected LLMW.MIGRATE.LIST.4-R1): the old
 * chain's rejection gate lived in `normalizeRawSuggestion`, before its own
 * "empty" refusal (`parseSuggestionsResult`, pre-migration lines 99-104) —
 * it dropped an item whose `targetType` was not exactly `"shot"`/`"sequence"`
 * (lines 62-64), or whose `targetId`/`assetId` failed `num()`, "integer and
 * > 0" (lines 41-44, 66-70) — before "no valid suggestions" could ever fire.
 * The runner's own gate for the equivalent checks lives in the
 * `postResponse` form, which always runs *after* the descriptor's own
 * `output.errors.empty` refusal (`runner.ts`), and its own item-level parse
 * gate, `output.item.validity`, only requires `targetType` to be a
 * *non-empty* string (`descriptors/castingFromSequence.ts`) — it does not
 * check that the value is recognised, nor that `targetId`/`assetId` (both
 * `fallback: "omit"`) are present. A response whose items all satisfy that
 * looser gate but would have been rejected by the old chain's tighter one —
 * an unrecognised `targetType`, or an id that is not a positive integer —
 * therefore passes the empty-refusal (the parsed, pre-filter array is
 * non-empty) and only becomes `[]` once the `postResponse` form drops every
 * item — this adapter then returns `{ ok: true, suggestions: [] }` where the
 * old chain threw the `empty` message. This is distinct from a well-formed
 * but non-existent id (e.g. a hallucinated `999999`): `num()` accepts that
 * value too, so the old chain lets it through just as far, and both chains
 * agree on `{ ok: true, suggestions: [] }` there. Arbitrated by the user on
 * 2026-08-17: accepted as-is, asserted by name in
 * `tests/llmWorkspace/casting.migration.test.ts`, not "fixed" here — folding
 * the `empty` message onto a post-filter empty array would instead corrupt
 * the far more common case of well-formed but hallucinated ids, where the old
 * chain legitimately returns `{ ok: true, suggestions: [] }` today.
 */
export async function generateCastingSuggestionsDraft(
  formData: FormData
): Promise<
  { ok: true; suggestions: GeneratedCastingSuggestion[] } | { ok: false; error: string }
> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const includeSequenceLevel = formData.get("includeSequenceLevel") === "true";

    const result = await runOperation(
      castingFromSequenceDescriptor,
      { projectId, sequenceId },
      { parameters: { includeSequenceLevel } }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `castingFromSequenceDescriptor.output.kind` is always `"list"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "list") {
      throw new Error("generateCastingSuggestionsDraft: expected a list-kind result.");
    }
    if (castingFromSequenceDescriptor.output.kind !== "list") {
      throw new Error("generateCastingSuggestionsDraft: descriptor output is not list-kind.");
    }

    const fields = castingFromSequenceDescriptor.output.item.fields;
    const suggestions: GeneratedCastingSuggestion[] = result.items.map((item) => {
      // PIÈGE 1 — read directly off the runner item, never through
      // `mapListItemToModelKeys` (see the function's own header comment).
      const alreadyAssignedRaw = item.alreadyAssigned;
      if (typeof alreadyAssignedRaw !== "boolean") {
        throw new Error(
          "generateCastingSuggestionsDraft: expected a boolean \"alreadyAssigned\" on every item."
        );
      }

      const mapped = mapListItemToModelKeys(fields, item);
      const targetIdValue = mapped.targetId;
      const assetIdValue = mapped.assetId;
      if (typeof targetIdValue !== "number") {
        throw new Error("generateCastingSuggestionsDraft: expected a numeric \"targetId\" on every item.");
      }
      if (typeof assetIdValue !== "number") {
        throw new Error("generateCastingSuggestionsDraft: expected a numeric \"assetId\" on every item.");
      }

      const reasonValue = mapped.reason;
      if (typeof reasonValue !== "string") {
        throw new Error("generateCastingSuggestionsDraft: expected a string \"reason\" on every item.");
      }

      return {
        targetType: mapped.targetType as GeneratedCastingSuggestion["targetType"],
        targetId: targetIdValue,
        targetLabel: mapped.targetLabel as string,
        assetId: assetIdValue,
        assetName: mapped.assetName as string,
        assetType: mapped.assetType as GeneratedCastingSuggestion["assetType"],
        // PIÈGE 2 — `reason` alone is filled back to `null`.
        reason: reasonValue === "" ? null : reasonValue,
        confidence: mapped.confidence as GeneratedCastingSuggestion["confidence"],
        alreadyAssigned: alreadyAssignedRaw,
      };
    });

    return { ok: true, suggestions };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

export async function applySelectedCastingSuggestions(
  formData: FormData
): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;
  const selectedJson = (formData.get("selectedJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}castingsError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found.");
  }

  const shotList = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const assetList = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.projectId, projectId));

  const validShotIds = new Set(shotList.map((s) => s.id));
  const validAssetIds = new Set(assetList.map((a) => a.id));

  let selected: unknown[];
  try {
    const parsed = JSON.parse(selectedJson);
    if (!Array.isArray(parsed)) throw new Error();
    selected = parsed;
  } catch {
    errRedirect("Invalid suggestion data.");
  }

  let inserted = 0;
  for (const raw of selected!) {
    const s = normalizeRawSuggestion(raw);
    if (!s) continue;
    if (!validAssetIds.has(s.assetId)) continue;
    if (s.targetType === "shot" && !validShotIds.has(s.targetId)) continue;
    if (s.targetType === "sequence" && s.targetId !== sequenceId) continue;

    try {
      if (s.targetType === "shot") {
        await db.insert(shotAssets).values({ shotId: s.targetId, assetId: s.assetId });
      } else {
        await db
          .insert(sequenceAssets)
          .values({ sequenceId: s.targetId, assetId: s.assetId });
      }
      inserted++;
    } catch {
      // Duplicate — unique constraint, skip silently
    }
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}castingsApplied=${inserted}`);
}
