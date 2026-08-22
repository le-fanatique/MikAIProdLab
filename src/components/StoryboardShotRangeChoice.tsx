"use client";

// ---------------------------------------------------------------------------
// StoryboardShotRangeChoice.tsx — SEQGEN.STORYBOARD.SHOTRANGE.1
//
// Two <select>s picking an inclusive [From Shot, To Shot] sub-range of the
// Sequence's Shots. Narrows the Storyboard prompt's shot content
// (shotInputs/shotCount/lighting, via selectStoryboardShotRange) — never the
// casting reference pool, which stays computed on the whole Sequence.
//
// Same plain GET form shape as StoryboardCompositionChoice: every current
// search param survives except this control's own two keys (replaced by the
// selects' submitted values), so the generate page's server read
// (`shotFrom`/`shotTo` searchParams) stays the single source of truth —
// never a client-held choice. AutoSubmitSelect (already shared by the LLM
// Workflows bench) submits on change.
// ---------------------------------------------------------------------------

import AutoSubmitSelect from "@/components/AutoSubmitSelect";

type ShotOption = { id: number; label: string };

/**
 * REVISE (2026-08-22) — this control is shared by more than one page, and
 * what the range actually DOES differs between them (narrows the generation
 * prompt's shot content on the generate page; decides thumbnail-to-Shot
 * matching on the Extract page). The explanatory sentence is therefore an
 * injectable prop rather than fixed text, so a caller never inherits a
 * claim (e.g. about casting) that is false on its own page. Defaults to the
 * generate page's original sentence byte-for-byte, so that page needs no
 * change.
 */
const DEFAULT_HELP_TEXT =
  "By default this Storyboard covers every Shot of the Sequence. Pick a From/To Shot to narrow " +
  "it to an inclusive range — both endpoints are included. Casting references stay computed on " +
  "the whole Sequence regardless of this choice.";

type Props = {
  basePath: string;
  currentSearchParams: Record<string, string>;
  /** Every Shot of the Sequence, in Sequence order — never pre-filtered by the current range. */
  shots: ShotOption[];
  /** "" when no bound is set (the default: the sequence's own border). */
  currentFromValue: string;
  currentToValue: string;
  /** What this range actually does on the calling page. Defaults to the generate page's original sentence. */
  helpText?: string;
};

export default function StoryboardShotRangeChoice({
  basePath,
  currentSearchParams,
  shots,
  currentFromValue,
  currentToValue,
  helpText = DEFAULT_HELP_TEXT,
}: Props) {
  const passthroughParams = Object.entries(currentSearchParams).filter(
    ([key]) => key !== "shotFrom" && key !== "shotTo"
  );

  const fromOptions = [
    { value: "", label: "First Shot" },
    ...shots.map((s) => ({ value: String(s.id), label: s.label })),
  ];
  const toOptions = [
    { value: "", label: "Last Shot" },
    ...shots.map((s) => ({ value: String(s.id), label: s.label })),
  ];

  return (
    <form method="GET" action={basePath} className="flex flex-col gap-2">
      {passthroughParams.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <p className="text-xs text-[#4b5158]">{helpText}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <AutoSubmitSelect
          name="shotFrom"
          defaultValue={currentFromValue}
          options={fromOptions}
          className="w-full max-w-md rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] cursor-pointer"
        />
        <span className="text-xs text-[#6e767d]">to</span>
        <AutoSubmitSelect
          name="shotTo"
          defaultValue={currentToValue}
          options={toOptions}
          className="w-full max-w-md rounded bg-[#0d0e10] border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] cursor-pointer"
        />
      </div>
    </form>
  );
}
