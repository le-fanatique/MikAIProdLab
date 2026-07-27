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

type Props = {
  /** "Project Style" for Asset, "Resolved Sequence Style" for Shot. */
  sourceLabel: string;
  prepared: PreparedGenerationStyleSource;
  /**
   * STYLE.1.E.SURFACES.1 (retake) — whether the canonical payload
   * (`buildGenerationPayload`, computed by the caller with this exact Style
   * already composed in) actually found a patchable text/prompt/string/value
   * field on a real text-kind node. A workflow with no text input at all, or
   * whose only declared text input has no compatible field, must never be
   * shown as if the compiled segment and composed counts describe what will
   * be queued — they would describe a prompt nothing will ever read.
   */
  textInjectable: boolean;
};

export default function ProjectStyleGenerationPreview({ sourceLabel, prepared, textInjectable }: Props) {
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

  if (!textInjectable) {
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
        <p className="text-xs text-[#b89a5a]">
          This workflow has no compatible text input; Project Style will not be injected into this generation.
        </p>
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
