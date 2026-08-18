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

/**
 * LLMW.BENCH.CONTROLS.1 (S3) — `firstBenchParam`'s multi-value counterpart:
 * a `"multiEnum"` control is a checkbox per member, so a repeated query key
 * must become the *whole* array, not just its first entry. Exported for the
 * page's own redisplay: which member checkboxes come back checked after
 * Apply reads the same "single value or array, either way an array" rule as
 * the parser below, rather than a second, divergent one.
 */
export function multiEnumBenchParam(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * LLMW.BENCH.CONTROLS.1 (S3) — piège B. A `"multiEnum"` param's query key
 * (`param.id`) is absent both when the param was never submitted *and* when
 * every member checkbox is unchecked (a GET form sends nothing for an
 * unchecked checkbox) — yet those two states must produce different
 * intentions: the first omits the parameter (its declared default applies),
 * the second must produce an explicit empty array (`normalizeIntentParameters`
 * treats `[]` as a valid, significant selection — B7f-m). The form carries an
 * always-rendered hidden marker under this derived name, independent of
 * `param.id` itself, so the parser can tell "the group was on the page" from
 * "the group was never on the page" without touching the checkboxes' own
 * query key. Exported so the page's marker `name` and the parser's lookup
 * can never drift apart.
 */
export function multiEnumPresenceParamName(parameterId: string): string {
  return `${parameterId}__present`;
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
 *
 * `intent.freeText` (LLMW.INTENT.FREETEXT.1, B9a) is read only when the
 * descriptor declares it, and only when the `freeText` param is actually
 * present in `searchParams` — an absent param means "the field was never
 * submitted" and `intent.freeText` stays `undefined`, exactly like `mode`
 * and `parameters` above. Unlike `parameters`, an empty or blank value is
 * *kept*, not omitted: the render form's own contract (§4.1 of the ticket)
 * already collapses "absent / empty / blank" to the same empty-string
 * output, so there is no second place that needs to re-decide it.
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
    const parameters: Record<string, number | string | boolean | string[]> = {};
    for (const param of descriptor.intent.parameters) {
      if (param.type === "multiEnum") {
        // Piège B: a raw value present means at least one member was
        // checked; the presence marker means the group was on the page at
        // all, checked or not. Neither present -> the param was never
        // submitted, and stays omitted so the declared default applies.
        const raw = searchParams[param.id];
        const present = searchParams[multiEnumPresenceParamName(param.id)] != null;
        if (raw == null && !present) continue;
        parameters[param.id] = multiEnumBenchParam(raw);
        continue;
      }

      const raw = firstBenchParam(searchParams[param.id]);
      if (raw == null || raw === "") continue;
      if (param.type === "integer") {
        const n = Number(raw);
        if (Number.isFinite(n)) parameters[param.id] = n;
      } else if (param.type === "boolean") {
        // Piège A's other half: only "true"/"false" convert here. Any other
        // string is left as-is for `normalizeIntentParameters` to reject,
        // exactly like an out-of-range integer.
        if (raw === "true") parameters[param.id] = true;
        else if (raw === "false") parameters[param.id] = false;
        else parameters[param.id] = raw;
      } else {
        parameters[param.id] = raw;
      }
    }
    if (Object.keys(parameters).length > 0) intent.parameters = parameters;
  }

  if (descriptor.intent.freeText) {
    const raw = firstBenchParam(searchParams.freeText);
    if (raw != null) intent.freeText = raw;
  }

  return intent;
}

/**
 * LLMW.LIGHTING.FROMIMAGE.1 (B16b) — the bench's counterpart to `intent`'s
 * own query-string reading above, for a descriptor that declares `images`
 * (LLMW.DESCRIPTOR.IMAGE.1, B16a). Read the same way `multiEnumBenchParam`
 * reads a `"multiEnum"` `intent.parameters` entry: a repeated `imageIds`
 * query key becomes the whole array, not just its first value — this is the
 * bench's own re-reading of the selection server-side, from `searchParams`,
 * per this file's own header rule ("no second reading rule, no trust in a
 * client-built object") applied to the selection exactly as it already
 * applies to `intent`.
 *
 * Returns `[]` for a descriptor that declares no `images` (nothing to read),
 * and for a present-but-unparsable value (a non-integer, a non-positive
 * integer) — the same "silently drop what does not parse" rule
 * `parsePositiveIntParam` above already applies to `projectId`/`sequenceId`/
 * `shotId`/`assetId`; the runner's own `minCount` refusal is what tells the
 * user their selection did not take, not a parse-time throw here.
 *
 * **Order.** The array this returns is in the order `searchParams.imageIds`
 * lists them — which, for the bench's own checkbox control (`page.tsx`), is
 * the checkbox list's own display order (the Asset's reference images,
 * insertion order), never the order the user actually clicked the boxes in:
 * an HTML checkbox group serializes in DOM order regardless of click order,
 * the same limitation `intent.parameters`'s own `"multiEnum"` checkboxes
 * already have. This is reported rather than silently assumed — see
 * `.agents/executor_report.md`.
 */
export function parseSelectedImageIdsFromSearchParams(
  descriptor: OperationDescriptor,
  searchParams: BenchSearchParams
): number[] {
  if (!descriptor.images) return [];
  const raw = searchParams.imageIds;
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const ids: number[] = [];
  for (const value of values) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) ids.push(n);
  }
  return ids;
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
