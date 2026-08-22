// ---------------------------------------------------------------------------
// selectDefaultWorkflowOptions.ts — WF.GALLERY.2 §3/§4
//
// Pure module: no "use server", no database access, no React import, no
// network — same shape as `workflowGallery.ts`.
//
// Builds the option list for one `/settings` "Default …" dropdown. There are
// six such dropdowns (ticket §3), and the mapping is deliberately
// asymmetric:
//   - four (asset / shot-keyframe / shot-video / look-development) filter by
//     `kind` AND a `WorkflowContextId`, via `isWorkflowOfferedIn`;
//   - the two Camera Lab dropdowns (gaussian-ply / gaussian-to-image) filter
//     by `kind` and `status` ONLY — Camera Lab deliberately has no entry in
//     `WORKFLOW_CONTEXTS` (WF.CATALOG.1 §2.1), and inventing one here would
//     reproduce the exact defect this ticket closes (§1). Callers pass
//     `context: null` for these two.
//
// All six dropdowns share the same "already-registered default" exception:
// an `archived` workflow is normally excluded, but if it is the id currently
// stored as this selector's default, it stays in the list, marked, rather
// than silently vanishing from under the author.
// ---------------------------------------------------------------------------

import {
  isWorkflowOfferedIn,
  parseWorkflowContexts,
  type WorkflowContextId,
  type WorkflowKind,
  type WorkflowStatus,
} from "@/lib/comfy/workflowCatalog";

export interface DefaultWorkflowOptionRow {
  id: number;
  name: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  /** Raw, possibly corrupt `contexts` column — parsed internally. */
  contexts: string | null;
}

export interface DefaultWorkflowOption {
  id: number;
  name: string;
  /** True when this option is shown only because it is the registered
   *  default and would otherwise have been excluded (currently: because it
   *  is archived). Callers use this to render a visual marker, e.g. a
   *  "(archived)" suffix. */
  archived: boolean;
}

/**
 * Selects and orders the options for one default-workflow dropdown.
 *
 * @param workflows       every workflow row (unfiltered by kind).
 * @param kind             the `kind` this dropdown accepts.
 * @param context          the context to filter on, or `null` for the two
 *                          Camera Lab dropdowns (kind + status only).
 * @param currentDefaultId the workflow id currently stored as this
 *                          selector's default, or `null`.
 */
export function selectDefaultWorkflowOptions<T extends DefaultWorkflowOptionRow>(
  workflows: readonly T[],
  kind: WorkflowKind,
  context: WorkflowContextId | null,
  currentDefaultId: number | null
): DefaultWorkflowOption[] {
  const options: DefaultWorkflowOption[] = [];

  for (const workflow of workflows) {
    if (workflow.kind !== kind) continue;

    const isCurrentDefault = currentDefaultId !== null && workflow.id === currentDefaultId;

    if (workflow.status === "archived") {
      if (isCurrentDefault) {
        options.push({ id: workflow.id, name: workflow.name, archived: true });
      }
      continue;
    }

    if (context !== null) {
      const offered = isWorkflowOfferedIn(
        { kind: workflow.kind, contexts: parseWorkflowContexts(workflow.contexts), status: workflow.status },
        context
      );
      if (!offered) continue;
    }

    options.push({ id: workflow.id, name: workflow.name, archived: false });
  }

  return options;
}
