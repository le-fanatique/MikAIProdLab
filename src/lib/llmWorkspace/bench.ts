// ---------------------------------------------------------------------------
// bench.ts — LLMW.BENCH.READ.1 (B6b)
//
// Pure decision logic for the read-only bench route
// (`src/app/settings/llm-workflows/[templateId]/page.tsx`) — nothing here
// touches the database, calls the LLM, or writes. Kept out of the Server
// Component per `.claude/rules/frontend.md` ("Keep business logic and
// durable decisions out of Client Components") and the ticket's own "rien
// de pur ne doit vivre dans le composant" (§8).
// ---------------------------------------------------------------------------

import type { EntityKind, OperationDescriptor, VariableId } from "./types";
import { requiredAnchorIdKeys, type AnchorIds, type OperationIntentInput } from "./runner";
import { estimateTokens } from "./tokenEstimate";

// ---------------------------------------------------------------------------
// §3 — `templateId` -> stored row or built-in descriptor. Aligned on the
// `parseInt` convention already used by
// `src/app/api/llm-templates/[templateId]/export/route.ts`: a segment that
// `parseInt`s to a positive integer addresses a stored row (even a segment
// with a trailing non-digit suffix, e.g. "12abc" -> 12 — the same rule the
// export route already applies); anything else is read as a built-in
// descriptor id. Resolving that id against `DESCRIPTORS` / the database, and
// answering `notFound()` when neither resolves, is the route's job, not
// this pure function's.
// ---------------------------------------------------------------------------

export type TemplateRef = { kind: "stored"; id: number } | { kind: "builtin"; id: string };

export function parseTemplateRef(segment: string): TemplateRef {
  const id = parseInt(segment, 10);
  if (Number.isInteger(id) && id > 0) {
    return { kind: "stored", id };
  }
  return { kind: "builtin", id: segment };
}

// ---------------------------------------------------------------------------
// §4.1 — the stale-selection trap. `sequenceIds` / `shotIds` / `assetIds` are
// the ids actually available for the currently selected parent, queried by
// the page. `projectId` has no such list to check against here — a project
// that does not exist is caught downstream, by the runner's own
// ownership-chain check (`messages.chainNotFound`), not by this function.
// ---------------------------------------------------------------------------

export type NormalizeBenchSelectionInput = {
  anchorEntity: EntityKind;
  selection: AnchorIds;
  sequenceIds: number[];
  shotIds: number[];
  assetIds: number[];
};

export type NormalizeBenchSelectionResult = {
  selection: AnchorIds;
  complete: boolean;
};

export function normalizeBenchSelection({
  anchorEntity,
  selection,
  sequenceIds,
  shotIds,
  assetIds,
}: NormalizeBenchSelectionInput): NormalizeBenchSelectionResult {
  const projectId = selection.projectId;

  const sequenceId =
    selection.sequenceId != null && sequenceIds.includes(selection.sequenceId)
      ? selection.sequenceId
      : undefined;

  // The shot is downstream of the sequence: a dropped sequence drops it too,
  // regardless of what `shotIds` says about the raw, unvalidated shot id.
  const shotId =
    sequenceId != null && selection.shotId != null && shotIds.includes(selection.shotId)
      ? selection.shotId
      : undefined;

  const assetId =
    selection.assetId != null && assetIds.includes(selection.assetId) ? selection.assetId : undefined;

  const normalized: AnchorIds = { projectId, sequenceId, shotId, assetId };
  const complete = requiredAnchorIdKeys(anchorEntity).every((key) => normalized[key] != null);

  return { selection: normalized, complete };
}

// ---------------------------------------------------------------------------
// Reading the `<form method="get">`'s `searchParams` (§4, §4.2) into typed
// shapes. Next.js hands each key a `string | string[] | undefined` (a
// repeated query key becomes an array); every one of this bench's controls
// is a single `<select>` or `<input>`, so only the first value is ever
// meaningful.
// ---------------------------------------------------------------------------

export type BenchSearchParams = Record<string, string | string[] | undefined>;

/**
 * Exported so the page can read a raw parameter's current string value for a
 * form control's `defaultValue` (e.g. an out-of-range `intent.parameters`
 * input the user should still see on redisplay) without a second, divergent
 * "pick the first value" rule.
 */
export function firstBenchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveIntParam(value: string | string[] | undefined): number | undefined {
  const raw = firstBenchParam(value);
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function parseSelectionFromSearchParams(searchParams: BenchSearchParams): AnchorIds {
  return {
    projectId: parsePositiveIntParam(searchParams.projectId),
    sequenceId: parsePositiveIntParam(searchParams.sequenceId),
    shotId: parsePositiveIntParam(searchParams.shotId),
    assetId: parsePositiveIntParam(searchParams.assetId),
  };
}

/**
 * §4.2 — intent controls, rendered only when the descriptor declares them.
 * A requested `mode` unknown to the descriptor falls back to `defaultMode`
 * (mirrors `runner.ts`'s own `resolveSelectedMode` fallback for an
 * undeclared `messages.invalidMode`, so the bench never shows a state the
 * runner itself would silently correct). A left-blank `integer` parameter is
 * omitted, not defaulted — `outline.generate` / `targetSections` treats
 * blank and filled as two legitimately different renders (§4.2).
 * `intent.freeText` is deliberately not read: no descriptor declares it
 * (deferred to B6c, see the executor report).
 */
export function parseIntentInputFromSearchParams(
  descriptor: OperationDescriptor,
  searchParams: BenchSearchParams
): OperationIntentInput {
  const intent: OperationIntentInput = {};

  if (descriptor.intent.mode) {
    const raw = firstBenchParam(searchParams.mode);
    const isKnown = raw != null && descriptor.intent.mode.modes.some((m) => m.id === raw);
    intent.mode = isKnown ? raw : descriptor.intent.mode.defaultMode;
  }

  if (descriptor.intent.parameters && descriptor.intent.parameters.length > 0) {
    const parameters: Record<string, number | string> = {};
    for (const param of descriptor.intent.parameters) {
      const raw = firstBenchParam(searchParams[param.id]);
      if (raw == null || raw === "") continue;
      if (param.type === "integer") {
        const n = Number(raw);
        if (Number.isFinite(n)) parameters[param.id] = n;
      } else {
        parameters[param.id] = raw;
      }
    }
    if (Object.keys(parameters).length > 0) intent.parameters = parameters;
  }

  return intent;
}

// ---------------------------------------------------------------------------
// §5.1 — per-variable rendering: resolved data serialised readable, its
// character count, and its token estimate. `data === undefined` (a resolver
// that produced nothing, distinct from an explicit `null`) is rendered as
// `null` rather than disappearing, per §5.1: "Une donnée null/vide s'affiche
// comme telle, elle ne disparaît pas."
// ---------------------------------------------------------------------------

export type VariablePreviewRow = {
  id: VariableId;
  text: string;
  charCount: number;
  tokenEstimate: number;
};

export function buildVariablePreviewRows(
  variables: Array<{ id: VariableId; data: unknown }>
): VariablePreviewRow[] {
  return variables.map(({ id, data }) => {
    const text = JSON.stringify(data === undefined ? null : data, null, 2);
    return { id, text, charCount: text.length, tokenEstimate: estimateTokens(text) };
  });
}
