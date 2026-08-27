// ---------------------------------------------------------------------------
// workflowGallery.ts — WF.GALLERY.1 §4
//
// Pure module: no "use server", no database access, no React import, no
// network. The gallery's selection and grouping, extracted so it is testable
// without a DOM (see `.claude/skills/mikai-method` §5 — there is no jsdom
// harness in this repo, by decision).
//
// `isWorkflowOfferedIn` already is, and stays, the single definition of
// "is this workflow offered here" (WF.CATALOG.1 §2.4). This module composes
// it — OR-ing it across every context a page passes, so a page like the Shot
// workflow picker (offered in `shot-keyframe` OR `shot-video`) does not need
// to hand-roll that OR itself — and adds the two things `isWorkflowOfferedIn`
// was never meant to do: free-text search, and grouping into gallery
// sections ordered by `WORKFLOW_CATEGORY_IDS`.
// ---------------------------------------------------------------------------

import {
  isWorkflowOfferedIn,
  isWorkflowCategoryId,
  parseWorkflowContexts,
  parseWorkflowTags,
  WORKFLOW_CATEGORIES,
  WORKFLOW_CATEGORY_IDS,
  type WorkflowCategoryId,
  type WorkflowContextId,
  type WorkflowKind,
  type WorkflowStatus,
} from "@/lib/comfy/workflowCatalog";

/**
 * The raw shape `selectGalleryWorkflows` needs from a `comfy_workflows` row.
 * `category`, `tags` and `contexts` are the raw, possibly corrupt, database
 * columns — this function parses them itself (via the tolerant `parse*`
 * readers) rather than requiring the caller to pre-parse, so a corrupt row
 * degrades exactly once, in one place.
 */
export interface GalleryWorkflowRow {
  name: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  description: string | null;
  category: string | null;
  tags: string | null;
  contexts: string | null;
  /** WF.FAVORITE.1 — an independent display flag, not part of `category`.
   * See `groupGalleryWorkflowsWithFavorites` below for what it does to
   * grouping. */
  isFavorite: boolean;
}

export interface WorkflowGallerySection<T extends GalleryWorkflowRow> {
  categoryId: WorkflowCategoryId | "uncategorized" | "favorites";
  label: string;
  workflows: T[];
}

export interface SelectGalleryWorkflowsOptions {
  /**
   * OR semantics: a workflow is kept if it is offered in *any* of these
   * contexts. Omitted or empty means "do not context-filter" — the Settings
   * manager's case, where `status` and context are not filters at all.
   */
  contexts?: readonly WorkflowContextId[];
  /** Free text. Trimmed and matched case-insensitively. Empty filters nothing. */
  search?: string;
}

function matchesSearch<T extends GalleryWorkflowRow>(workflow: T, searchLower: string): boolean {
  if (searchLower.length === 0) return true;

  if (workflow.name.toLowerCase().includes(searchLower)) return true;
  if (workflow.description && workflow.description.toLowerCase().includes(searchLower)) return true;

  // Tolerant read: a corrupt `tags` column must never throw here, and must
  // never exclude the row from the result — it simply cannot match on tags.
  const tags = parseWorkflowTags(workflow.tags);
  return tags.some((tag) => tag.toLowerCase().includes(searchLower));
}

function isOfferedInAny<T extends GalleryWorkflowRow>(
  workflow: T,
  contexts: readonly WorkflowContextId[]
): boolean {
  const offerInput = {
    kind: workflow.kind,
    contexts: parseWorkflowContexts(workflow.contexts),
    status: workflow.status,
  };
  return contexts.some((contextId) => isWorkflowOfferedIn(offerInput, contextId));
}

/**
 * Selects and groups workflows for the gallery. Never throws on a corrupt
 * `category`/`tags`/`contexts` column — a corrupt row still renders, under
 * "Uncategorized" if its category is unreadable.
 */
export function selectGalleryWorkflows<T extends GalleryWorkflowRow>(
  workflows: readonly T[],
  options: SelectGalleryWorkflowsOptions = {}
): WorkflowGallerySection<T>[] {
  const contexts = options.contexts ?? [];
  const searchLower = (options.search ?? "").trim().toLowerCase();

  const filtered = workflows.filter((workflow) => {
    if (contexts.length > 0 && !isOfferedInAny(workflow, contexts)) return false;
    return matchesSearch(workflow, searchLower);
  });

  const sections: WorkflowGallerySection<T>[] = [];

  for (const categoryId of WORKFLOW_CATEGORY_IDS) {
    const rows = filtered.filter((workflow) => workflow.category === categoryId);
    if (rows.length > 0) {
      sections.push({ categoryId, label: WORKFLOW_CATEGORIES[categoryId].label, workflows: rows });
    }
  }

  const uncategorized = filtered.filter(
    (workflow) => workflow.category === null || !isWorkflowCategoryId(workflow.category)
  );
  if (uncategorized.length > 0) {
    sections.push({ categoryId: "uncategorized", label: "Uncategorized", workflows: uncategorized });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// groupGalleryWorkflowsWithFavorites — WF.FAVORITE.1 §5
//
// Layered on top of `selectGalleryWorkflows`, never duplicating its
// filtering/grouping rules. A favorite is deliberately kept in its own
// category section AND copied into a synthetic "Favorites" section placed
// first — the ticket's own decision (§0/§5): a favorite is a flag, not a
// category, so it must not lose its real place while still standing out.
// Hidden entirely when there is no favorite in the filtered set, so an
// author who has starred nothing never sees an empty "Favorites" header.
// ---------------------------------------------------------------------------

export function groupGalleryWorkflowsWithFavorites<T extends GalleryWorkflowRow>(
  workflows: readonly T[],
  options: SelectGalleryWorkflowsOptions = {}
): WorkflowGallerySection<T>[] {
  const sections = selectGalleryWorkflows(workflows, options);
  const favorites = sections.flatMap((section) => section.workflows).filter((wf) => wf.isFavorite);

  if (favorites.length === 0) return sections;

  return [{ categoryId: "favorites", label: "Favorites", workflows: favorites }, ...sections];
}

// ---------------------------------------------------------------------------
// buildLibraryCategories — WF.LIBRARY.1 §5
//
// The workflow library's sidebar. Pure, and deliberately built on top of
// `selectGalleryWorkflows` rather than duplicating its grouping rules: the
// same context filter, the same `WORKFLOW_CATEGORY_IDS` order, the same
// tolerant handling of a corrupt `category`/`tags`/`contexts` column. This
// composition is *why* the counts already satisfy "reflect the context
// already filtered, not the whole library" and "an empty category does not
// appear" — both are `selectGalleryWorkflows`'s existing behaviour, not
// reimplemented here.
//
// `contexts` is required (not optional, unlike `selectGalleryWorkflows`):
// the library is always entered from a context (shot or asset), never from
// the context-agnostic Settings manager.
// ---------------------------------------------------------------------------

export interface LibraryCategoryEntry {
  /** "favorites" and "all" are synthetic — not `WorkflowCategoryId`s.
   * "favorites" (WF.FAVORITE.1 §5), when present, is always first — even
   * before "all". */
  id: WorkflowCategoryId | "uncategorized" | "all" | "favorites";
  label: string;
  count: number;
}

export function buildLibraryCategories<T extends GalleryWorkflowRow>(
  workflows: readonly T[],
  contexts: readonly WorkflowContextId[]
): LibraryCategoryEntry[] {
  const sections = selectGalleryWorkflows(workflows, { contexts });
  const total = sections.reduce((n, s) => n + s.workflows.length, 0);

  const entries: LibraryCategoryEntry[] = [];

  // WF.FAVORITE.1 §5/§6 — "Favorites" comes before "All" itself, counted
  // from the same context-filtered `sections` "All" already uses (never the
  // unfiltered library), and appended only when there is at least one — a
  // permanently empty "Favorites" row would be noise, and is exactly
  // today's state for all 33 workflows.
  const favoritesCount = sections.reduce(
    (n, s) => n + s.workflows.filter((wf) => wf.isFavorite).length,
    0
  );
  if (favoritesCount > 0) {
    entries.push({ id: "favorites", label: "Favorites", count: favoritesCount });
  }

  entries.push({ id: "all", label: "All", count: total });

  let uncategorizedEntry: LibraryCategoryEntry | null = null;
  for (const section of sections) {
    const entry: LibraryCategoryEntry = {
      id: section.categoryId,
      label: section.label,
      count: section.workflows.length,
    };
    if (section.categoryId === "uncategorized") {
      uncategorizedEntry = entry;
    } else {
      entries.push(entry);
    }
  }

  // `selectGalleryWorkflows` already appends "uncategorized" last among its
  // sections, but that ordering is re-asserted here explicitly rather than
  // relied upon implicitly, since this function's own contract ("All" first,
  // "Uncategorized" last) must hold even if that upstream ordering changes.
  if (uncategorizedEntry) entries.push(uncategorizedEntry);

  return entries;
}

// ---------------------------------------------------------------------------
// resolveLibraryCategory — WF.LIBRARY.FAVDEFAULT.1 §4.1
//
// The library's default-category decision, pulled out of the component so it
// is testable without a DOM (no jsdom harness in this repo, by decision —
// see `.claude/skills/mikai-method` §5). A `param` that names an entry
// actually present in `categories` (built by `buildLibraryCategories` for
// this context) wins outright — "all" and "favorites" included. Anything
// else — absent, empty, unrecognized, or a valid category id that simply
// isn't offered in this context — falls back to the default: "favorites" if
// that entry exists here, "all" otherwise.
// ---------------------------------------------------------------------------

export function resolveLibraryCategory(
  param: string | null,
  categories: readonly LibraryCategoryEntry[]
): LibraryCategoryEntry["id"] {
  if (param !== null && categories.some((cat) => cat.id === param)) {
    return param as LibraryCategoryEntry["id"];
  }
  return categories.some((cat) => cat.id === "favorites") ? "favorites" : "all";
}
