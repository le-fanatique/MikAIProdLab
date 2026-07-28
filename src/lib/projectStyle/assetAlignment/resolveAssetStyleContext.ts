import "server-only";

// ---------------------------------------------------------------------------
// resolveAssetStyleContext.ts — STYLE.1.F.CORE
//
// Server-only orchestration: resolves the Project's active published Style
// through the canonical `resolveActiveProjectStyle` (STYLE.1.E.CORE.1) —
// never a Working Draft, Sequence override, or client-supplied snapshot —
// then compiles it into the shared, consumer-filtered segments
// (styleContext.ts). This is the single call site Enhance Description,
// Enhance Asset Bible and explicit Alignment all go through, so a
// resolver/corruption failure is handled identically everywhere: a
// structured English error, never a silent unstyled fallback.
//
// Callers resolve this ONCE per action invocation (and, for a batch, once
// per batch — not once per item) so a Style activation mid-run cannot mix
// versions within the same call.
// ---------------------------------------------------------------------------

import { resolveActiveProjectStyle } from "../resolveSequenceStyle";
import { compileAssetStyleSegments, type AssetStyleSegments } from "./styleContext";

export type AssetStyleContext =
  | { mode: "none" }
  | {
      mode: "active";
      projectStyleVersionId: number;
      projectStyleVersionNumber: number;
      segments: AssetStyleSegments;
    };

export type ResolveAssetStyleContextResult = { ok: true; context: AssetStyleContext } | { ok: false; error: string };

export async function resolveAssetStyleContext(projectId: number): Promise<ResolveAssetStyleContextResult> {
  const resolved = await resolveActiveProjectStyle(projectId);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  if (resolved.result.mode === "none") {
    return { ok: true, context: { mode: "none" } };
  }

  return {
    ok: true,
    context: {
      mode: "active",
      projectStyleVersionId: resolved.result.versionId,
      projectStyleVersionNumber: resolved.result.versionNumber,
      segments: compileAssetStyleSegments(resolved.result.snapshot),
    },
  };
}
