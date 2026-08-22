// ---------------------------------------------------------------------------
// WorkflowSelectorPanel — WF.LIBRARY.1
//
// The workflow library the author actually reaches: "Change Workflow" on the
// Generate Content panel. Presentation reference is the ComfyUI templates
// browser — the *container*, not the content: no workflow is imported from
// that project. A full-screen overlay, not a side-panel list — it renders
// outside `GenerationPanelShell` entirely (the caller no longer wraps it),
// above everything at `z-[60]` (`GenerationPanelShell` stays `z-50`).
//
// The URL contract this panel is entered and exited through is frozen and
// unchanged (`?generation=open&selector=1` to force it open, `&workflowId=…`
// to leave it) — see the ticket's §0. What changed is what renders and
// where, plus one correction the ticket names as its trap: every link and
// the search form must reconduct the page's other URL state
// (`storyboardRefs`, `batchImages_*`, …) via `frozenParams`, following the
// `hiddenFields` precedent in `WorkflowTemplateGallery`. Losing it here would
// be a silent regression on the return trip into the generation panel.
//
// `isWorkflowOfferedIn`, `selectGalleryWorkflows`, `WorkflowTemplateCard`,
// `WORKFLOW_CATEGORIES`, `parseWorkflowTags`, `parseWorkflowContexts` and
// `refImageUrl` are reused as-is, per the ticket — none of them changed here.
// `buildLibraryCategories` (new, §5) is the only addition to
// `src/lib/comfy/workflowGallery.ts`, and is pure/tested there, not here:
// this component is not testable without a DOM, so it stays a thin render
// (method §5).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { type ReactNode } from "react";
import EmptyState from "@/components/EmptyState";
import WorkflowTemplateCard from "@/components/WorkflowTemplateCard";
import WorkflowLibraryGrid from "@/components/WorkflowLibraryGrid";
import WorkflowFavoriteButton from "@/components/WorkflowFavoriteButton";
import { type WorkflowGalleryEntry } from "@/components/WorkflowTemplateGallery";
import { parseWorkflowTags, isWorkflowCategoryId, type WorkflowContextId } from "@/lib/comfy/workflowCatalog";
import { selectGalleryWorkflows, buildLibraryCategories } from "@/lib/comfy/workflowGallery";

type Props = {
  workflows: readonly WorkflowGalleryEntry[];
  /** OR semantics — the shot picker passes `["shot-keyframe", "shot-video"]`,
   * the asset picker `["asset"]`. Replaces the old `kind === "image" |
   * "video"` in-component filter and the `context: "asset" | "shot"` prop. */
  contexts: readonly WorkflowContextId[];
  /** Bare path, no query string — the shot or asset detail page URL. */
  basePath: string;
  /** Every current search param except `q`, `cat`, and `workflowId` —
   * reconducted verbatim into the search form's hidden fields, every
   * category link's `href`, and the workflow-selection link's `href`, so the
   * page's other URL state survives browsing inside the library and the
   * return trip after a selection. */
  frozenParams: Record<string, string>;
  search: string;
  category: string | null;
  closeUrl: string;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
};

function buildHref(basePath: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export default function WorkflowSelectorPanel({
  workflows,
  contexts,
  basePath,
  frozenParams,
  search,
  category,
  closeUrl,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: Props) {
  // Search-independent: is there anything at all to show for this context?
  // Same distinction WorkflowTemplateGallery draws — a search box over an
  // empty context is not useful.
  const candidateSections = selectGalleryWorkflows(workflows, { contexts });
  const candidateCount = candidateSections.reduce((n, s) => n + s.workflows.length, 0);

  const closeButton = (
    <Link
      href={closeUrl}
      aria-label="Close panel"
      className="text-[#4b5158] hover:text-[#a4abb2] transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center shrink-0"
    >
      ×
    </Link>
  );

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Backdrop — a plain Link, no JavaScript, per the ticket. */}
      <Link href={closeUrl} aria-label="Close workflow library" className="absolute inset-0 bg-black/70" />

      <div className="relative z-10 flex w-full h-full bg-[#141618]">
        {candidateCount === 0 ? (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-end px-6 py-4 border-b border-[#232629] shrink-0">
              {closeButton}
            </div>
            <div className="flex-1 flex items-center justify-center">
              <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
            </div>
          </div>
        ) : (
          <LibraryBody
            workflows={workflows}
            contexts={contexts}
            basePath={basePath}
            frozenParams={frozenParams}
            search={search}
            category={category}
            closeButton={closeButton}
          />
        )}
      </div>
    </div>
  );
}

function LibraryBody({
  workflows,
  contexts,
  basePath,
  frozenParams,
  search,
  category,
  closeButton,
}: {
  workflows: readonly WorkflowGalleryEntry[];
  contexts: readonly WorkflowContextId[];
  basePath: string;
  frozenParams: Record<string, string>;
  search: string;
  category: string | null;
  closeButton: ReactNode;
}) {
  const categories = buildLibraryCategories(workflows, contexts);

  const selectedCategoryId =
    category && (isWorkflowCategoryId(category) || category === "uncategorized" || category === "favorites")
      ? category
      : null;

  // Context + search filtered, then narrowed to the selected sidebar
  // category (if any) — "All" shows every section flattened, without
  // sub-headers, since the sidebar is already the category navigation.
  // WF.FAVORITE.1 §5 — "Favorites" is not one of `selectGalleryWorkflows`'s
  // sections (it is a flag, not a category — §0), so it is filtered
  // separately rather than by matching a `section.categoryId`.
  const sections = selectGalleryWorkflows(workflows, { contexts, search });
  const visibleWorkflows =
    selectedCategoryId === "favorites"
      ? sections.flatMap((section) => section.workflows).filter((wf) => wf.isFavorite)
      : sections
          .filter((section) => selectedCategoryId === null || section.categoryId === selectedCategoryId)
          .flatMap((section) => section.workflows);

  const trimmedSearch = search.trim();

  const categoryHref = (id: string | null) =>
    buildHref(basePath, { ...frozenParams, q: search || undefined, cat: id ?? undefined });

  const workflowHref = (id: number) =>
    buildHref(basePath, { ...frozenParams, workflowId: String(id) });

  return (
    <>
      <aside className="w-56 shrink-0 border-r border-[#232629] overflow-y-auto py-6 px-3 flex flex-col gap-1">
        {categories.map((cat) => {
          const isActive =
            (cat.id === "all" && selectedCategoryId === null) || cat.id === selectedCategoryId;
          return (
            <Link
              key={cat.id}
              href={categoryHref(cat.id === "all" ? null : cat.id)}
              className={`flex items-center justify-between rounded px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? "bg-[#1a1d20] text-[#e7e9ec]"
                  : "text-[#a4abb2] hover:bg-[#1a1d20] hover:text-[#e7e9ec]"
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[10px] text-[#6e767d]">{cat.count}</span>
            </Link>
          );
        })}
      </aside>

      <WorkflowLibraryGrid
        showGrid={visibleWorkflows.length > 0}
        closeButton={closeButton}
        searchForm={
          <form method="get" action={basePath} className="flex-1 flex items-center gap-2 min-w-0">
            {Object.entries(frozenParams).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            {selectedCategoryId && <input type="hidden" name="cat" value={selectedCategoryId} />}
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Search by name, description or tag…"
              className="w-full max-w-sm rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors"
            />
            <button
              type="submit"
              className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Search
            </button>
          </form>
        }
      >
        {visibleWorkflows.length === 0 ? (
          <EmptyState
            title="No workflow matches your search."
            description={trimmedSearch ? `No workflow matches "${trimmedSearch}".` : undefined}
          />
        ) : (
          visibleWorkflows.map((wf) => (
            // WF.FAVORITE.1 §4 — the trap this ticket names: the card below
            // is wrapped in a `<Link>` that selects the workflow on click. A
            // `<form>` (the favorite button) nested inside that `<a>` would
            // be invalid HTML and would navigate instead of toggling. The
            // button is therefore a SIBLING of the `<Link>` here, absolutely
            // positioned over it from this `relative` wrapper — never a
            // child of the anchor.
            <div key={wf.id} className="relative">
              <Link
                href={workflowHref(wf.id)}
                className="block rounded-lg transition-colors hover:ring-1 hover:ring-[#3a4046]"
              >
                <WorkflowTemplateCard
                  name={wf.name}
                  kind={wf.kind}
                  description={wf.description}
                  tags={parseWorkflowTags(wf.tags)}
                  thumbnailPath={wf.thumbnailPath}
                />
              </Link>
              <WorkflowFavoriteButton
                workflowId={wf.id}
                isFavorite={wf.isFavorite}
                path={basePath}
                className="absolute top-4 left-4 z-10"
              />
            </div>
          ))
        )}
      </WorkflowLibraryGrid>
    </>
  );
}
