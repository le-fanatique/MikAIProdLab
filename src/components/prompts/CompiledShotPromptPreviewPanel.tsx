import type { ComposedShotGenerationPrompt } from "@/lib/prompts/composeShotGenerationPrompt";

type Props = {
  /** SHOTPROMPT.SHOT.1 — the shared composer's output (Style/Subject Definition/six parts/Timeline), never the bare `compileShotPrompt` result. */
  compiled: ComposedShotGenerationPrompt;
  workflowKind: string;
};

// ---------------------------------------------------------------------------
// SHOTPROMPT.STYLE.1 (Part A, preview/queue parity) — `compiled` is always
// resolved assuming "Append Project Style" is checked (both server-rendered
// callers, ShotGenerationPanel.tsx and the /map page, have no live
// per-request signal of the checkbox's actual state — same reason
// `ProjectStyleAppendCheckbox`/`ProjectStyleGenerationPreview` already do the
// checked/unchecked swap entirely with a `group-has-[#appendProjectStyle:
// not(:checked)]` CSS selector, no client JS, no second server render).
//
// This panel follows the identical convention for the Style HEADER only —
// never a second full composed prompt. `compiled.sections` already isolates
// the "style" section from the rest (never re-parsed from `compiled.text`);
// `styleSeparatedText` below reconstructs the exact string
// `composeShotGenerationPrompt` would have produced with no Project Style by
// removing the KNOWN, self-computed `"Style: <text>\n\n"` prefix it just
// verified is actually there — never a heuristic split of opaque text. If
// the prefix does not match (defensive: the compositeur's own join rule
// changed), this falls back to the full `compiled.text` for both states
// rather than risk showing a wrong "rest".
// ---------------------------------------------------------------------------

export default function CompiledShotPromptPreviewPanel({ compiled, workflowKind }: Props) {
  const finalTextLabel =
    compiled.kind === "video"
      ? compiled.usedTimeline
        ? "Final text for video — Shot Prompt + Timeline."
        : "Final text for video — Shot Prompt only (no Timeline included)."
      : "Final text for image — Shot Prompt only. Timeline is never included for image workflows.";

  const styleSection = compiled.sections.find((section) => section.id === "style");
  const stylePrefixText = styleSection ? `Style: ${styleSection.text}` : null;
  const styleSeparatedText = (() => {
    if (!stylePrefixText) return compiled.text;
    if (compiled.text === stylePrefixText) return "";
    const withSeparator = `${stylePrefixText}\n\n`;
    return compiled.text.startsWith(withSeparator) ? compiled.text.slice(withSeparator.length) : compiled.text;
  })();
  // Only trust the split when it actually reconstructs `compiled.text` —
  // otherwise the "rest" block below falls back to the untouched full text
  // so a drifted join rule can never produce a silently wrong preview.
  const splitIsSound =
    stylePrefixText !== null &&
    (compiled.text === stylePrefixText || compiled.text === `${stylePrefixText}\n\n${styleSeparatedText}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <span>
          <span className="text-[#4b5158]">Workflow kind </span>
          <span className="text-[#a4abb2] font-mono">{workflowKind}</span>
        </span>
        {compiled.usedTimeline && (
          <span className="text-[#6b9e72]">Timeline included</span>
        )}
      </div>

      {compiled.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {compiled.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-[#b89a5a]">{warning}</p>
          ))}
        </div>
      )}

      {/* Sections actually used — reflects only real, non-empty inputs */}
      {compiled.sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Sections used
          </p>
          <div className="flex flex-col gap-2">
            {compiled.sections.map((section) => (
              <div
                key={section.id}
                className={
                  section.id === "style"
                    ? "flex flex-col gap-1 group-has-[#appendProjectStyle:not(:checked)]/style:hidden"
                    : "flex flex-col gap-1"
                }
              >
                <span className="text-[10px] text-[#6e767d]">{section.label}</span>
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed">
                  {section.text}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Final Text
        </p>
        <pre className="whitespace-pre-wrap font-mono text-xs text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-3 leading-relaxed min-h-[3rem]">
          {stylePrefixText && splitIsSound && (
            <span className="group-has-[#appendProjectStyle:not(:checked)]/style:hidden">
              {stylePrefixText}
              {"\n\n"}
            </span>
          )}
          {(splitIsSound ? styleSeparatedText : compiled.text) || <span className="text-[#4b5158]">(empty)</span>}
        </pre>
      </div>

      <p className="text-xs text-[#4b5158]">
        {finalTextLabel} This is the exact text sent to Text Prompt inputs for this workflow.
      </p>
    </div>
  );
}
