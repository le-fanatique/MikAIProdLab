import Card from "@/components/Card";
import StoryboardShotRangeChoice from "@/components/StoryboardShotRangeChoice";
import type { ExtractionShotRangeSource } from "@/lib/storyboardExtraction/resolveExtractionShotRange";

type ShotOption = { id: number; label: string };

type Props = {
  basePath: string;
  currentSearchParams: Record<string, string>;
  shots: ShotOption[];
  currentFromValue: string;
  currentToValue: string;
  source: ExtractionShotRangeSource;
  shotCount: number;
  totalShotCount: number;
  droppedShotIds: number[];
  warnings: string[];
};

// REVISE (2026-08-22) — `StoryboardShotRangeChoice`'s own default help text
// talks about casting references, a notion the Extract page has no such
// thing as: here the range decides thumbnail-to-Shot matching, not a
// reference pool. This page's own sentence, passed via `helpText`, says what
// actually happens here instead.
const EXTRACT_HELP_TEXT =
  "This range decides which Shots the Storyboard's thumbnails are matched against. Both endpoints " +
  "are included. By default it covers the whole Sequence; an explicit choice made here always " +
  "overrides a range inherited from the generation.";

/**
 * "Storyboard Shot Range" — SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1. Wraps the
 * existing `StoryboardShotRangeChoice` (reused verbatim, same GET form/
 * passthrough/AutoSubmitSelect contract as the generate page) with a status
 * line naming where the current range came from, plus any informative
 * warning — never a block, never a `throw`. The "full Sequence" case (the
 * uploaded-image path, and the ordinary case for most Sequences) stays the
 * most discreet: a single quiet sentence, no color, no icon.
 */
export default function StoryboardShotRangeCard({
  basePath,
  currentSearchParams,
  shots,
  currentFromValue,
  currentToValue,
  source,
  shotCount,
  totalShotCount,
  droppedShotIds,
  warnings,
}: Props) {
  const originLine =
    source === "inherited"
      ? `Shot range inherited from the generation that produced this Storyboard: ${shotCount} of ${totalShotCount} Shots.`
      : source === "explicit"
        ? `Shot range set here: ${shotCount} of ${totalShotCount} Shots.`
        : `Covers the full Sequence (${totalShotCount} Shot${totalShotCount !== 1 ? "s" : ""}).`;

  return (
    <Card title="Storyboard Shot Range">
      <StoryboardShotRangeChoice
        basePath={basePath}
        currentSearchParams={currentSearchParams}
        shots={shots}
        currentFromValue={currentFromValue}
        currentToValue={currentToValue}
        helpText={EXTRACT_HELP_TEXT}
      />
      <p className={`mt-2 text-xs ${source === "full-sequence" ? "text-[#4b5158]" : "text-[#a4abb2]"}`}>
        {originLine}
      </p>
      {droppedShotIds.length > 0 && (
        <p className="mt-1 text-xs text-[#cda24f]">
          {droppedShotIds.length} inherited Shot id{droppedShotIds.length !== 1 ? "s no" : " no"} longer exist
          {droppedShotIds.length !== 1 ? "" : "s"} in this Sequence: {droppedShotIds.join(", ")}.
        </p>
      )}
      {warnings.map((w, i) => (
        <p key={i} className="mt-1 text-xs text-[#cda24f]">
          {w}
        </p>
      ))}
    </Card>
  );
}
