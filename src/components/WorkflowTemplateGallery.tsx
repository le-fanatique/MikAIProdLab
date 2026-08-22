import { type ReactNode } from "react";
import EmptyState from "@/components/EmptyState";
import SectionLabel from "@/components/SectionLabel";
import WorkflowTemplateCard from "@/components/WorkflowTemplateCard";
import { parseWorkflowTags, type WorkflowContextId } from "@/lib/comfy/workflowCatalog";
import { selectGalleryWorkflows, type GalleryWorkflowRow } from "@/lib/comfy/workflowGallery";
import { THUMBNAIL_SIZE_CSS_VAR, THUMBNAIL_SIZE_DEFAULT } from "@/lib/thumbnailSize";

/** What a caller's row needs on top of `GalleryWorkflowRow` to render as a card. */
export type WorkflowGalleryEntry = GalleryWorkflowRow & {
  id: number;
  thumbnailPath: string | null;
};

type Props<T extends WorkflowGalleryEntry> = {
  /** The candidate set — not yet context- or search-filtered. This component
   * calls `selectGalleryWorkflows` itself so it can tell "no workflow at all"
   * (context-filtered, search-independent) apart from "no result for this
   * search" — they are different dead ends with different messages. */
  workflows: readonly T[];
  /** Omit for the Settings manager, which shows everything regardless of
   * context and where `status` is not a filter. */
  contexts?: readonly WorkflowContextId[];
  search: string;
  renderActions?: (workflow: T) => ReactNode;
  renderBadges?: (workflow: T) => ReactNode;
  /** Shown when there is no workflow at all for this context — independent
   * of the search term. */
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** GET query param name the search field submits under. Default "q". */
  searchParamName?: string;
  /** Preserves every other query param this page already carries (e.g. the
   * Shot page's `storyboard` / `storyboardRefs`) as hidden fields, so a
   * search does not drop them. */
  hiddenFields?: ReactNode;
  /** Settings renders Active and Archived as two separate galleries that
   * must share one search bar, not two — pass `false` on every instance but
   * the one that owns the visible `<form>`. Default `true`. */
  renderSearchForm?: boolean;
  /** WF.LIBRARY.2 — when true, each section's grid columns follow the
   * shared thumbnail-size preference (`ThumbnailSizeControl`,
   * `--wf-thumb-size`) instead of the fixed `grid-cols-1 sm:grid-cols-2
   * lg:grid-cols-3` breakpoints. Only the Settings workflow manager opts in;
   * the four production galleries (shots, assets, storyboard, storyboard
   * video) are out of this ticket's scope and keep the fixed grid. Default
   * `false`. */
  sizable?: boolean;
};

export default function WorkflowTemplateGallery<T extends WorkflowGalleryEntry>({
  workflows,
  contexts,
  search,
  renderActions,
  renderBadges,
  emptyTitle,
  emptyDescription,
  emptyAction,
  searchParamName = "q",
  hiddenFields,
  renderSearchForm = true,
  sizable = false,
}: Props<T>) {
  // Search-independent: is there anything at all to show here? If not, a
  // search box over an empty context is not useful — show the "no workflow"
  // dead end instead.
  const candidateSections = selectGalleryWorkflows(workflows, { contexts });
  const candidateCount = candidateSections.reduce((n, s) => n + s.workflows.length, 0);

  if (candidateCount === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const sections = selectGalleryWorkflows(workflows, { contexts, search });
  const resultCount = sections.reduce((n, s) => n + s.workflows.length, 0);
  const trimmedSearch = search.trim();

  return (
    <div>
      {renderSearchForm && (
        <form method="get" className="mb-6 flex items-center gap-2">
          {hiddenFields}
          <input
            type="text"
            name={searchParamName}
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
      )}

      {resultCount === 0 ? (
        <EmptyState
          title="No workflow matches your search."
          description={trimmedSearch ? `No workflow matches "${trimmedSearch}".` : undefined}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <div key={section.categoryId}>
              <SectionLabel label={section.label} />
              <div
                className={sizable ? "grid gap-4" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"}
                style={
                  sizable
                    ? {
                        gridTemplateColumns: `repeat(auto-fill, minmax(var(${THUMBNAIL_SIZE_CSS_VAR}, ${THUMBNAIL_SIZE_DEFAULT}px), 1fr))`,
                      }
                    : undefined
                }
              >
                {section.workflows.map((workflow) => (
                  <WorkflowTemplateCard
                    key={workflow.id}
                    name={workflow.name}
                    kind={workflow.kind}
                    description={workflow.description}
                    tags={parseWorkflowTags(workflow.tags)}
                    thumbnailPath={workflow.thumbnailPath}
                    actions={renderActions?.(workflow)}
                    badges={renderBadges?.(workflow)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
