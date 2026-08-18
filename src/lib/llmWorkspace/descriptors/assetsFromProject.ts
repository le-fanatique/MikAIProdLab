// ---------------------------------------------------------------------------
// descriptors/assetsFromProject.ts — LLMW.DESCRIPTOR.ASSETS.1 (B7f + B7c-n1)
//
// Descriptor for `assets.fromProject`, matching `generateAssetCandidatesDraft`
// (`src/actions/llm/assetExtraction.ts`) and its builder
// (`src/lib/prompts/assets-from-project.ts`, `buildAssetsFromProjectPrompt`)
// — the oracle, left untouched. The third `kind: "list"` descriptor
// (LLMW.OUTPUT.LIST.1/2, B7a/B7b), the first to declare a `"boolean"` or a
// `"multiEnum"` `intent.parameters` entry (LLMW.DESCRIPTOR.ASSETS.1's own
// format extension, §1 of the ticket), and the first `preconditions` entry to
// reference something other than an anchor field — `refs`, replacing
// `fields` outright in this same diff (§2/§3 of the ticket; every other
// descriptor's precondition is migrated mechanically alongside this one).
//
// `context.variables` reads all three project-scope collections
// (`PROJECT.SEQUENCES`, `PROJECT.SHOTS`, `PROJECT.ASSETS`, declared and
// proven against a real database by LLMW.VAR.PROJECT_SCOPE.1, B7c-n2, but
// unreferenced by any descriptor until now) alongside `PROJECT.IDENTITY`.
//
// Two parameters: `includeShots` (`"boolean"`, default `false`) and
// `assetTypes` (`"multiEnum"`, default `["character", "environment",
// "prop"]`) — both defaults are the panel's real initial state
// (`AssetsLLMExtractPanel.tsx:63-69`), so the operation is executable at the
// bench with no new bench control (`bench.ts`'s `parseIntentInputFromSearchParams`
// only reads numbers/strings; a `boolean`/`multiEnum` param always falls back
// to its declared default there — out of scope to wire, per the ticket).
//
// §5 of the ticket, an accepted divergence, not a defect: in
// `generateAssetCandidatesDraft`, "Select at least one asset type." is
// checked *before* `getLLMConfig()` and before any database read
// (`assetExtraction.ts:103-113`). In this runner, every `preconditions` entry
// is checked *after* the LLM-config check and the anchor-chain load
// (`runner.ts`'s `resolvePromptInternal`, steps 2-4 precede the precondition
// check). So a run with no asset type selected *and* no LLM configured now
// reads "LLM not configured. Go to Settings to set up Ollama." instead of
// "Select at least one asset type." — arbitrated by the supervisor:
// reordering the runner's own step sequence for this one edge case would put
// every other descriptor's step order at risk, which costs more than the
// divergence itself. Not corrected here.
// ---------------------------------------------------------------------------

import type { OperationDescriptor } from "../types";

// `VALID_ASSET_TYPES` (`assetExtraction.ts:13-20`) — the closed set both the
// `multiEnum` parameter's `values` and the `assetType` output field's `enum`
// `values` are drawn from. Declared here, not imported from the action
// module: a descriptor stays pure data (§3.1 of `types.ts`'s own correction),
// and `src/lib/prompts/` is the only module this ticket is authorized to read
// from, not import.
const ASSET_TYPE_VALUES = ["character", "environment", "prop", "vehicle", "crowd", "other"] as const;

export const assetsFromProjectDescriptor: OperationDescriptor = {
  id: "assets.fromProject",
  name: "Extract Assets from Project",

  // `generateAssetCandidatesDraft` reads only `projectId`
  // (`assetExtraction.ts:87-90`) — no deeper chain to verify.
  anchor: { kind: "entity", entity: "project" },

  context: {
    variables: [
      { id: "PROJECT.IDENTITY", userAdjustable: false },
      { id: "PROJECT.SEQUENCES", userAdjustable: false },
      { id: "PROJECT.SHOTS", userAdjustable: false },
      { id: "PROJECT.ASSETS", userAdjustable: false },
    ],
  },

  expertise: {
    role: "assetsFromProjectSupervisor",
    system: {
      // One block: the whole system message is static except for two
      // interpolation points (`project.name`, `typesStr` x2), with no branch
      // at all — see `renderAssetsFromProjectSystemBody`'s own header note
      // in `variables/registry.ts` for why this stays a single block instead
      // of being split.
      blocks: [
        { variables: ["PROJECT.IDENTITY"], parameters: ["assetTypes"], render: "assetsFromProject.systemBody" },
      ],
      separator: "\n",
    },
    knowledge: [],
  },

  template: {
    blocks: [
      // Block 1 — always non-empty: `Project: ...` / conditional Pitch /
      // conditional Story (only when no outline).
      { variable: "PROJECT.IDENTITY", render: "assetsFromProject.backgroundLines" },
      // Block 2 — mutually exclusive with itself: outline block when
      // present, else story block when present, else empty (neither).
      { variable: "PROJECT.IDENTITY", render: "assetsFromProject.outlineOrStoryBlock" },
      // Block 3 — sequences, empty when the Project has none.
      { variable: "PROJECT.SEQUENCES", render: "assetsFromProject.sequencesBlock" },
      // Block 4 — shots, gated on both `includeShots` and a non-empty
      // `PROJECT.SHOTS`.
      { variables: ["PROJECT.SHOTS"], parameters: ["includeShots"], render: "assetsFromProject.shotsBlock" },
      // Block 5 — existing assets, empty when the Project has none.
      { variable: "PROJECT.ASSETS", render: "assetsFromProject.existingAssetsBlock" },
      // Block 6 — always non-empty: the closing instruction line.
      { parameter: "assetTypes", render: "assetsFromProject.finalInstructionLine" },
    ],
    // The oracle's own `parts.join("\n\n")` separator (`assets-from-project.ts:143-145`)
    // — every other descriptor uses `"\n"`; this one does not, because its
    // source builder does not either. See `variables/registry.ts`'s render
    // forms' own header note for the algebraic argument that this
    // reproduces the oracle byte-for-byte.
    separator: "\n\n",
  },

  intent: {
    // LLMW.DESCRIPTOR.ASSETS.1 (B7f)'s own format extension: the first
    // `"boolean"` and the first `"multiEnum"` `intent.parameters` entries.
    // Both defaults are `AssetsLLMExtractPanel.tsx:63-69`'s real initial
    // panel state — three asset types checked (character, environment,
    // prop), three unchecked, shots excluded — so this descriptor is
    // executable at the bench (with its declared defaults; see the ticket's
    // own "Hors scope") with no new contract needed.
    parameters: [
      { id: "includeShots", type: "boolean", label: "Include shots", default: false },
      {
        id: "assetTypes",
        type: "multiEnum",
        label: "Asset types to extract",
        values: ASSET_TYPE_VALUES,
        default: ["character", "environment", "prop"],
      },
    ],
  },

  // Read verbatim from `generateAssetCandidatesDraft` (`assetExtraction.ts`):
  // `"Invalid request."` (line 89) on a malformed `projectId`; `"LLM not
  // configured. Go to Settings to set up Ollama."` (line 111) —
  // deliberately different wording from `sequences.fromOutline`'s "LLM
  // provider not configured. Go to Settings to configure Ollama.", verified
  // against the source rather than assumed, and recopied as-is, not
  // uniformed; `"Project not found."` (line 116). No `invalidMode`: the
  // action takes no assist mode.
  messages: {
    invalidRequest: "Invalid request.",
    notConfigured: "LLM not configured. Go to Settings to set up Ollama.",
    chainNotFound: { project: "Project not found." },
  },

  // Two guards, both read verbatim off `assetExtraction.ts` (§4 of the
  // ticket) — see the module header above for the accepted ordering
  // divergence between the two.
  preconditions: [
    // `if (assetTypes.length === 0) return {ok:false, error:"Select at
    // least one asset type."}` (`assetExtraction.ts:103-105`) — the first
    // `{parameter}` ref this codebase declares: the normalized
    // `assetTypes` value (always an array once normalized) must be
    // non-empty.
    { refs: [{ parameter: "assetTypes" }], require: "all", message: "Select at least one asset type." },
    // `hasNarrative = outline?.trim() || story?.trim() || pitch?.trim() ||
    // seqs.length > 0` (`assetExtraction.ts:129-135`) — "at least one of
    // four", the first `preconditions` entry to mix `anchorField` refs with
    // a `variable` ref (`PROJECT.SEQUENCES`) in the same `"any"` rule; the
    // half of this gate `fields: FieldRef[]` could not express before this
    // ticket.
    {
      refs: [{ anchorField: "pitch" }, { anchorField: "story" }, { anchorField: "outline" }, { variable: "PROJECT.SEQUENCES" }],
      require: "any",
      message: "No narrative content found. Add a pitch, story, outline, or sequences first.",
    },
  ],

  // Reproduces `normalizeCandidate` (`assetExtraction.ts:36-60`) field by
  // field, in its own declaration order. `assetType` / `sourceLevel` are the
  // two `"enum"` fields (LLMW.OUTPUT.LIST.2, B7b, §3.4): no `.trim()` before
  // comparison, matching `normalizeAssetType`'s and `normalizeCandidate`'s
  // own identity comparison — `" hero "` is not `"hero"` and falls back to
  // the default, exactly like `readEnumField`'s own documented behaviour.
  output: {
    kind: "list",
    // `parseAssetsResult`'s own top-level key (`assetExtraction.ts:70`).
    arrayKey: "assets",
    item: {
      fields: [
        { type: "string", field: "name", jsonKey: "name", truncateTo: 200 },
        { type: "enum", field: "assetType", jsonKey: "assetType", jsonKeyFallback: "asset_type", values: [...ASSET_TYPE_VALUES], default: "other" },
        { type: "string", field: "description", jsonKey: "description", truncateTo: 500 },
        { type: "string", field: "notes", jsonKey: "notes", truncateTo: 500 },
        { type: "enum", field: "sourceLevel", jsonKey: "sourceLevel", jsonKeyFallback: "source_level", values: ["outline", "sequence", "shot", "story"], default: "outline" },
        { type: "string", field: "sourceExcerpt", jsonKey: "sourceExcerpt", jsonKeyFallback: "source_excerpt", truncateTo: 200 },
        { type: "string", field: "duplicateWarning", jsonKey: "duplicateWarning", jsonKeyFallback: "duplicate_warning", truncateTo: 200 },
      ],
      // `normalizeCandidate` returns `null` (item dropped) only when `name`
      // is missing (`assetExtraction.ts:39-40`) — the sole gate.
      validity: { fields: ["name"], require: "all" },
    },
    // `parseAssetsResult`'s own `.slice(0, 20)` (`assetExtraction.ts:80`),
    // applied after the empty-refusal and after the (absent) sort — verified
    // against the source, not assumed. No `sort`: `parseAssetsResult` never
    // sorts.
    maxItems: 20,
    // `createSelectedAssets` reads `selectedJson` (`assetExtraction.ts:203`).
    selection: { formDataKey: "selectedJson" },
    errors: {
      // `parseAssetsResult` (`assetExtraction.ts:62-81`).
      unparsable: "The model returned an unexpected format. Try again.",
      notArray: "The model did not return an assets array. Try again.",
      empty: "The model returned no valid assets. Try again.",
    },
  },

  // LLMW.ASSETS.TYPEFILTER.1 (S2). Not a reproduction of the oracle: a
  // deliberate behaviour change, decided by the user on 2026-08-17
  // (`docs/ARCHITECTURE_DECISIONS.md`, "Four Arbitrations Taken 2026-08-17",
  // point 2), made possible only now that the pipeline has a post-response
  // stage at all (LLMW.POSTRESPONSE.1, B7c-n3). `generateAssetCandidatesDraft`
  // asks the model for the checked types, but the model sometimes answers
  // with another — its own output schema lists all six, and a bench run
  // requesting three types once returned a `vehicle` (`9fdda6a`). The prompt
  // builder said the same thing before this migration, byte for byte: that
  // observable slippage is preexisting, not introduced here. What changes is
  // the decision to stop tolerating it: a candidate whose `assetType` was not
  // among the requested `assetTypes` is now dropped, in the one stage able to
  // look at the parsed answer after the fact. See
  // `renderAssetsFromProjectFilterByType` (`variables/registry.ts`) for the
  // filter itself.
  postResponse: {
    form: "assetsFromProject.filterByType",
    variables: [],
    parameters: ["assetTypes"],
  },

  // `createSelectedAssets` (`src/actions/llm/assetExtraction.ts:198-259`) is
  // already declared in `ACTION_REGISTRY` as an `"insert"` entry
  // (LLMW.ACTION.INSERT.1, B7c-w) — the write side this descriptor was
  // missing.
  commit: ["createSelectedAssets"],

  executor: "inProcess",
};
