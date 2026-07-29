import "server-only";

// ---------------------------------------------------------------------------
// resolveLookStyleSource.ts — STYLE.1.G.CORE.1
//
// Resolves the EXPLICIT, discriminated Style source a Look Test creation
// request names — never the implicit active-published pointer
// (resolveActiveProjectStyle is deliberately NOT used here: Look
// Development must be able to test a Working Draft or an older published
// version, not only "whatever is currently active").
//
//   - "working-draft": reads project_style_drafts/_sections/_rules fresh,
//     inside one transaction, and refuses if the draft's current `revision`
//     no longer matches the caller's `expectedRevision` — the exact same
//     optimistic-concurrency contract already used everywhere else a draft
//     is read for a real snapshot (see src/actions/projectStyle.ts). Reuses
//     the canonical `buildStyleSnapshotFromRows` assembler — no second
//     draft-to-snapshot assembler is created.
//   - "published-version": reads the exact immutable version by id, checks
//     Project confinement, and re-verifies its stored `compiledText`
//     against a fresh `compileStyleSnapshot` of its own `contentSnapshot`
//     (the same corruption guard `resolveSequenceStyle.ts` already applies
//     to every published-version read).
//
// Either branch returns a byte-identical snapshot/compiledText pair the
// caller then copies verbatim onto its own `look_tests` row — this
// resolver never mutates anything.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projectStyleDrafts, projectStyleSections, projectStyleRules, projectStyleVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildStyleSnapshotFromRows } from "@/lib/projectStyle/buildStyleSnapshot";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import { parseStyleSnapshotFromJson } from "@/lib/projectStyle/validateStyleSnapshot";
import type { StyleSnapshot } from "@/lib/projectStyle/styleSnapshot";
import type { LookStyleSourceRequest } from "./contracts";

export type ResolvedLookStyleSource = {
  styleSourceKind: "working-draft" | "published-version";
  styleDraftRevision: number | null;
  styleVersionId: number | null;
  snapshot: StyleSnapshot;
  compiledText: string;
};

export type ResolveLookStyleSourceResult = { ok: true; result: ResolvedLookStyleSource } | { ok: false; error: string };

/**
 * Atomically reads the Working Draft, its sections and its rules inside a
 * single transaction so a concurrent draft edit cannot produce a hybrid
 * snapshot carrying the old revision with newer sections/rules.  The
 * published-version branch needs no transaction because it reads one
 * immutable row.
 */
export async function resolveLookStyleSource(projectId: number, request: LookStyleSourceRequest): Promise<ResolveLookStyleSourceResult> {
  if (request.kind === "working-draft") {
    const result = db.transaction((tx) => {
      const drafts = tx.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId)).all();
      const draft = drafts[0];
      if (!draft) return { ok: false as const, error: "This Project has no Working Draft yet." };
      if (draft.revision !== request.expectedRevision) {
        return {
          ok: false as const,
          error: `The Working Draft was changed elsewhere (current revision ${draft.revision}). Reload and try again.`,
        };
      }

      const sections = tx.select().from(projectStyleSections).where(eq(projectStyleSections.draftId, draft.id)).all();
      const rules = tx.select().from(projectStyleRules).where(eq(projectStyleRules.draftId, draft.id)).all();
      const snapshot = buildStyleSnapshotFromRows(draft, sections, rules);
      const compiledText = compileStyleSnapshot(snapshot);

      return {
        ok: true as const,
        result: { styleSourceKind: "working-draft" as const, styleDraftRevision: draft.revision, styleVersionId: null, snapshot, compiledText },
      };
    });

    return result;
  }

  // request.kind === "published-version"
  const [version] = await db.select().from(projectStyleVersions).where(eq(projectStyleVersions.id, request.versionId));
  if (!version) return { ok: false, error: "The selected Project Style version was not found." };
  if (version.projectId !== projectId) return { ok: false, error: "The selected Project Style version belongs to a different Project." };

  const parsed = parseStyleSnapshotFromJson(version.contentSnapshot);
  if (!parsed.ok) return { ok: false, error: "The selected Project Style version is corrupted and cannot be read." };
  const snapshot: StyleSnapshot = parsed.snapshot;
  if (compileStyleSnapshot(snapshot) !== version.compiledText) {
    return { ok: false, error: "The selected Project Style version's stored content does not match its compiled text — refusing to use it." };
  }

  return {
    ok: true,
    result: {
      styleSourceKind: "published-version",
      styleDraftRevision: null,
      styleVersionId: version.id,
      snapshot,
      compiledText: version.compiledText,
    },
  };
}
