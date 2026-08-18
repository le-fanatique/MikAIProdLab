"use client";

// ---------------------------------------------------------------------------
// StoryboardCompositionChoice.tsx — LLMW.STORYBOARD.COMPOSE.2 (B14b)
//
// The control that picks between the Sequence Storyboard's two per-Shot
// compositions: "legacy" (the Shot-Prompt-only body this page has always
// sent) and "guide" (composeStoryboardShot's six-part composition, §5.5).
//
// A plain GET form to the same page, same shape as WorkflowScalarInputsForm's
// own passthrough form: every current search param survives except this
// control's own key (replaced by the select's submitted value), so the
// generation page's server read (`storyboardComposition` searchParam) is the
// single source of truth — never a client-held choice. AutoSubmitSelect
// (already shared by the LLM Workflows bench) submits on change; the
// underlying <select> works without JavaScript too, standard HTML form
// behavior.
// ---------------------------------------------------------------------------

import AutoSubmitSelect from "@/components/AutoSubmitSelect";

type Props = {
  basePath: string;
  currentSearchParams: Record<string, string>;
  currentValue: string;
};

const OPTIONS = [
  { value: "legacy", label: "Legacy — Shot Prompt only (default)" },
  { value: "guide", label: "Guide composition — subject, action, environment, camera, style, constraints" },
];

export default function StoryboardCompositionChoice({ basePath, currentSearchParams, currentValue }: Props) {
  const passthroughParams = Object.entries(currentSearchParams).filter(
    ([key]) => key !== "storyboardComposition"
  );

  return (
    <form method="GET" action={basePath} className="flex flex-col gap-2">
      {passthroughParams.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <p className="text-xs text-[#4b5158]">
        Compare the two Storyboard prompt compositions on this Sequence before generating. Only the
        per-Shot body changes — the Sequence preamble and Shot order stay the same either way.
      </p>
      <AutoSubmitSelect
        name="storyboardComposition"
        defaultValue={currentValue}
        options={OPTIONS}
        className="w-full max-w-md rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] cursor-pointer"
      />
    </form>
  );
}
