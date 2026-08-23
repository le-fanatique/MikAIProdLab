// ---------------------------------------------------------------------------
// variableLibrary.ts — LLMW.VARLIB.1 (B6c2)
//
// The read-only "registry filtered by anchor type" of
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §5.2: every variable of
// `VARIABLE_REGISTRY`, resolved against the current test entity's ids, next
// to its token cost — the discoverability of a node library, plus seeing
// what a block produces before wiring it. Pure decision/resolution logic,
// kept out of the Server Component per `.claude/rules/frontend.md`, same
// discipline as `bench.ts` for the sibling bench route.
//
// Assembled entirely from existing bricks (ticket §"L'essentiel existe déjà"):
// `VARIABLE_REGISTRY` is the one list that fixes which variables exist;
// `estimateTokens` is the one token-cost function; the resolved-value
// rendering (JSON, `undefined` -> `null`) matches `buildVariablePreviewRows`
// (`bench.ts`) exactly, so the same value looks the same in both places.
// ---------------------------------------------------------------------------

import type { EntityKind, VariableId } from "./types";
import type { AnchorIds } from "./runner";
import { VARIABLE_REGISTRY } from "./variables/registry";
import { estimateTokens } from "./tokenEstimate";

// ---------------------------------------------------------------------------
// Anchor derivation — mirrors `anchorIdForVariable` (`runner.ts:212-228`)
// exactly: a variable's anchor is its own namespace prefix (`PROJECT.*` ->
// project, `SEQ.*` -> sequence, `SHOT.*` -> shot, `ASSET.*` -> asset), never
// `descriptor.anchor` (this module has no descriptor at all — the library
// shows the registry independently of any operation). `anchorIdForVariable`
// itself is not exported and `runner.ts` is out of this ticket's scope
// (`.agents/supervised_task.md`), so this is the same rule re-expressed
// here, not a second, independently-invented correspondence — the four-way
// switch below is the only place this module decides prefix -> anchor, and
// every lookup (both `anchorEntityForVariable` and `anchorIdForEntity`) goes
// through it.
// ---------------------------------------------------------------------------

export function anchorEntityForVariable(id: VariableId): EntityKind {
  const prefix = id.split(".")[0];
  switch (prefix) {
    case "PROJECT":
      return "project";
    case "SEQ":
      return "sequence";
    case "SHOT":
      return "shot";
    case "ASSET":
      return "asset";
    // STYLE.LLM.LOOKFEEDBACK.CORE.1 — `LOOK.RESULT`'s own prefix.
    case "LOOK":
      return "lookResult";
    default:
      // Unreachable for any id actually typed `VariableId` — thrown loudly
      // rather than silently guessed at, same discipline as
      // `anchorIdForVariable`'s own throw for a missing id.
      throw new Error(`anchorEntityForVariable: unknown variable prefix for ${id}`);
  }
}

/**
 * The anchor id that corresponds to an entity kind, read off the same
 * `AnchorIds` shape `anchorIdForVariable` reads (`ids.projectId`,
 * `ids.sequenceId`, `ids.shotId`, `ids.assetId`) — the other half of the same
 * one rule, kept beside it rather than duplicated at each call site.
 */
function anchorIdForEntity(entity: EntityKind, ids: AnchorIds): number | undefined {
  switch (entity) {
    case "project":
      return ids.projectId;
    case "sequence":
      return ids.sequenceId;
    case "shot":
      return ids.shotId;
    case "asset":
      return ids.assetId;
    // STYLE.LLM.LOOKFEEDBACK.CORE.1 — neither the Variable Library page nor
    // the bench (`src/app/settings/llm-workflows/[templateId]/page.tsx`) has
    // a Look Result selector (no ticket in this chantier adds one — §"Ce que
    // le ticket ne fait pas"), so `ids.lookResultId` is never set by either
    // caller today. `LOOK.RESULT` therefore always resolves to `undefined`
    // here, which `resolveVariableLibraryRows` already renders as its
    // honest "unresolved" row — never a crash, never a silently wrong id.
    case "lookResult":
      return ids.lookResultId;
  }
}

// ---------------------------------------------------------------------------
// Per-variable resolution — the ticket's central trap. A resolver throws
// when its entity is not found (`resolveSeqShots: sequence 42 not found.`,
// and the same shape everywhere in `variables/registry.ts`), and the library
// resolves them all at once: a plain `Promise.all(entries.map(resolver))`
// would reject on the first throw and take the whole page down with it.
//
// This resolves the trap by never letting a rejection reach the aggregate at
// all: each mapped callback is itself `async` and wraps its own resolver
// call in `try/catch`, so every element of the array `Promise.all` awaits
// always fulfils — never rejects — regardless of what its own resolver did.
// `Promise.all` here is only ever used for its concurrency, not for
// aggregate error semantics; a variable's own failure is data (a `"error"`
// row), never an exception that escapes this function.
// ---------------------------------------------------------------------------

export type VariableLibraryRow =
  | { id: VariableId; anchor: EntityKind; status: "resolved"; text: string; charCount: number; tokenEstimate: number }
  | { id: VariableId; anchor: EntityKind; status: "unresolved" }
  | { id: VariableId; anchor: EntityKind; status: "error"; message: string };

export async function resolveVariableLibraryRows(ids: AnchorIds): Promise<VariableLibraryRow[]> {
  const entries = Object.entries(VARIABLE_REGISTRY) as Array<
    [VariableId, (anchorId: number) => Promise<unknown>]
  >;

  return Promise.all(
    entries.map(async ([id, resolve]): Promise<VariableLibraryRow> => {
      const anchor = anchorEntityForVariable(id);
      const anchorId = anchorIdForEntity(anchor, ids);

      // §3 of the ticket: an unselected required entity is not an error —
      // "SEQ.*"/"SHOT.*" stay simply not resolvable when only a project is
      // selected, said soberly, no error shape, no empty page.
      if (anchorId == null) {
        return { id, anchor, status: "unresolved" };
      }

      try {
        const data = await resolve(anchorId);
        // Same rendering as `buildVariablePreviewRows` (`bench.ts`): JSON,
        // `undefined` -> `null` so an absent resolver result is shown as
        // such rather than disappearing.
        const text = JSON.stringify(data === undefined ? null : data, null, 2);
        return { id, anchor, status: "resolved", text, charCount: text.length, tokenEstimate: estimateTokens(text) };
      } catch (err) {
        // §4 — the trap: this variable's failure stays on its own row, with
        // its own message, and does not touch any other row.
        return { id, anchor, status: "error", message: err instanceof Error ? err.message : String(err) };
      }
    })
  );
}
