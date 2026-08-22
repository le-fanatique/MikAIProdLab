// ---------------------------------------------------------------------------
// WorkflowFavoriteButton — WF.FAVORITE.1 §3/§4
//
// A Server Component: no `useState`, the checked state comes back from the
// server through `isFavorite`, same precedent as `DeleteButton.tsx` (a
// `<form>` around a single `<button type="submit">`). No client JS needed
// here at all — unlike `DeleteButton`, there is no `window.confirm`, so this
// stays server-rendered per the method's "prefer a form the platform can do
// without state" (`.claude/skills/mikai-method` §5).
//
// The structural trap this ticket is built around (§4): in
// `WorkflowSelectorPanel`, the card is wrapped in a `<Link>`. A `<form>`
// nested inside an `<a>` is invalid HTML, and would navigate on click
// instead of toggling. This component is therefore always rendered by its
// caller as a SIBLING of that link/card — never as a descendant — inside a
// `relative` wrapper, positioned `absolute` over the thumbnail. It renders
// no wrapper of its own beyond the `<form>`, so the caller controls exactly
// where it sits.
// ---------------------------------------------------------------------------

import { toggleWorkflowFavorite } from "@/actions/comfyWorkflows";

type Props = {
  workflowId: number;
  isFavorite: boolean;
  /** The page path to revalidate after the toggle — see the action's own
   * comment for why this is passed in rather than derived. */
  path: string;
  className?: string;
};

export default function WorkflowFavoriteButton({ workflowId, isFavorite, path, className = "" }: Props) {
  const action = toggleWorkflowFavorite.bind(null, workflowId, path);
  const label = isFavorite ? "Remove from favorites" : "Add to favorites";

  return (
    <form action={action} className={className}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-black/55 hover:bg-black/75 border border-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b93d6] focus-visible:ring-offset-1 focus-visible:ring-offset-black"
      >
        <span
          aria-hidden="true"
          className={`text-base leading-none ${isFavorite ? "text-[#e8b64a]" : "text-white/80"}`}
        >
          {isFavorite ? "★" : "☆"}
        </span>
      </button>
    </form>
  );
}
