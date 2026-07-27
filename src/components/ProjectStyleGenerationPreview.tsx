import type { PreparedGenerationStyleSource } from "@/lib/projectStyle/generationStylePreparation";

// ---------------------------------------------------------------------------
// ProjectStyleGenerationPreview.tsx — STYLE.1.E.SURFACES.1
//
// The one compact, inspectable Style panel shared by all four preview
// surfaces (embedded Asset/Shot panels, dedicated Asset/Shot generate
// pages). Presentational only — every value it renders was already resolved
// server-side by prepareGenerationStyleSource; this component never
// resolves, compiles or composes anything itself.
//
// A resolver/corruption error is rendered here and the caller is expected to
// also refuse to render the Generate form when `prepared.ok` is false (see
// docs/PROJECT_STYLE_MVP_SPEC.md §10-11 and the ticket's UI Contract) —
// never a silent fallback to no Style.
// ---------------------------------------------------------------------------

function resolutionLabelFor(mode: GenerationStyleProvenanceMode): string {
  switch (mode) {
    case "project-version":
      return "Active Published Version";
    case "inherited-project-version":
      return "Inherited from Project";
    case "sequence-override":
      return "Sequence Override";
  }
}

type GenerationStyleProvenanceMode = "project-version" | "inherited-project-version" | "sequence-override";

/**
 * STYLE.1.E.SURFACES.2 retake Round 1 — three distinct states, never
 * collapsed into a boolean:
 *   - "injected"       — a successful canonical payload build
 *     (`buildGenerationPayload`) found a real patchable text/prompt/string/
 *     value field on a text-kind node; the compiled segment/counts below
 *     describe exactly what will be queued;
 *   - "not-compatible" — a successful canonical payload build ran and
 *     produced ZERO text-kind patches; this is the only case allowed to show
 *     the "no compatible text input" message (Codex Round 1, P1);
 *   - "pending"         — the canonical payload build has not run yet
 *     (missing casting reference selection, unresolved Dynamic Batch/board
 *     target, unparseable workflow, or any other build failure unrelated to
 *     text compatibility). An unevaluated payload must never be presented as
 *     a confirmed incompatibility.
 */
export type StyleTextInjectability = "injected" | "not-compatible" | "pending";

type Props = {
  /** "Project Style" for Asset, "Resolved Sequence Style" for Shot/Sequence. */
  sourceLabel: string;
  prepared: PreparedGenerationStyleSource;
  textInjectability: StyleTextInjectability;
};

export default function ProjectStyleGenerationPreview({ sourceLabel, prepared, textInjectability }: Props) {
  const heading = (
    <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">{sourceLabel}</p>
  );

  if (!prepared.ok) {
    return (
      <div className="border-t border-[#232629] pt-4 flex flex-col gap-2">
        {heading}
        <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
          <p className="text-xs text-[#cf7b6b] leading-relaxed">{prepared.error}</p>
          <p className="text-xs text-[#cf7b6b] leading-relaxed mt-1">Generation is disabled until this is resolved.</p>
        </div>
      </div>
    );
  }

  const { compiledSegment, hasEffectiveStyle, composedSuggestedPrompt, provenanceCandidate } = prepared;

  if (!hasEffectiveStyle || provenanceCandidate === null) {
    return (
      <div className="border-t border-[#232629] pt-4 flex flex-col gap-2">
        {heading}
        <p className="text-xs text-[#6e767d]">No effective Style for this generation — the prompt is unchanged.</p>
      </div>
    );
  }

  if (textInjectability !== "injected") {
    const message =
      textInjectability === "pending"
        ? "Complete the required generation inputs to preview Project Style injection."
        : "This workflow has no compatible text input; Project Style will not be injected into this generation.";
    const messageColorClass = textInjectability === "pending" ? "text-[#6e767d]" : "text-[#b89a5a]";
    return (
      <div className="border-t border-[#232629] pt-4 flex flex-col gap-2">
        {heading}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#a4abb2]">
          <span>{resolutionLabelFor(provenanceCandidate.resolutionMode)}</span>
          {provenanceCandidate.resolutionMode === "sequence-override" ? (
            <>
              <span>Override revision {provenanceCandidate.sequenceOverrideRevision}</span>
              <span>Source Project Style v{provenanceCandidate.sourceProjectStyleVersionNumber}</span>
            </>
          ) : (
            <span>Project Style v{provenanceCandidate.projectStyleVersionNumber}</span>
          )}
        </div>
        <pre className="whitespace-pre-wrap rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-xs text-[#a4abb2] font-mono leading-relaxed">
          {compiledSegment}
        </pre>
        <p className={`text-xs ${messageColorClass}`}>{message}</p>
      </div>
    );
  }

  return (
    <div className="border-t border-[#232629] pt-4 flex flex-col gap-2">
      {heading}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#a4abb2]">
        <span>{resolutionLabelFor(provenanceCandidate.resolutionMode)}</span>
        {provenanceCandidate.resolutionMode === "sequence-override" ? (
          <>
            <span>Override revision {provenanceCandidate.sequenceOverrideRevision}</span>
            <span>Source Project Style v{provenanceCandidate.sourceProjectStyleVersionNumber}</span>
          </>
        ) : (
          <span>Project Style v{provenanceCandidate.projectStyleVersionNumber}</span>
        )}
      </div>
      <pre className="whitespace-pre-wrap rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-xs text-[#a4abb2] font-mono leading-relaxed">
        {compiledSegment}
      </pre>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#6e767d]">
        <span>
          Base prompt: {composedSuggestedPrompt.base.characters} characters / {composedSuggestedPrompt.base.utf8Bytes} UTF-8 bytes
        </span>
        <span>
          Style: {composedSuggestedPrompt.style.characters} characters / {composedSuggestedPrompt.style.utf8Bytes} UTF-8 bytes
        </span>
        <span>
          Composed prompt: {composedSuggestedPrompt.composed.characters} characters / {composedSuggestedPrompt.composed.utf8Bytes} UTF-8 bytes
        </span>
      </div>
    </div>
  );
}
