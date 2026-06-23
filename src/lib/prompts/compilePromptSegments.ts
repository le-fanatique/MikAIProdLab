import type { PromptSegment } from "@/db/schema";

export type CompiledSegmentTimingKind =
  | "full"
  | "start-only"
  | "duration-only"
  | "none";

export type CompiledSegmentLine = {
  index: number;
  label: string;
  segmentType: string | null;
  promptText: string;
  startSeconds: number | null;
  durationSeconds: number | null;
  endSeconds: number | null;
  timingKind: CompiledSegmentTimingKind;
  line: string;
};

export type CompiledPrompt = {
  lines: CompiledSegmentLine[];
  text: string;
  hasTiming: boolean;
  hasMissingTiming: boolean;
};

export function formatPromptSeconds(value: number): string {
  return String(parseFloat(value.toFixed(2)));
}

export function compilePromptSegments(segments: PromptSegment[]): CompiledPrompt {
  const sorted = [...segments].sort((a, b) => {
    const aStart = a.startSeconds;
    const bStart = b.startSeconds;
    if (aStart !== null && bStart !== null) {
      if (aStart !== bStart) return aStart - bStart;
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return a.id - b.id;
    }
    if (aStart !== null) return -1;
    if (bStart !== null) return 1;
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return a.id - b.id;
  });

  const lines: CompiledSegmentLine[] = sorted.map((seg, i) => {
    const promptText = seg.promptText.trim();
    const index = i + 1;
    const hasStart = seg.startSeconds !== null;
    const hasDuration = seg.durationSeconds !== null;

    let timingKind: CompiledSegmentTimingKind;
    let endSeconds: number | null = null;
    let line: string;

    if (hasStart && hasDuration) {
      timingKind = "full";
      endSeconds = seg.startSeconds! + seg.durationSeconds!;
      line = `${formatPromptSeconds(seg.startSeconds!)}-${formatPromptSeconds(endSeconds)}s: ${promptText}`;
    } else if (hasStart) {
      timingKind = "start-only";
      line = `from ${formatPromptSeconds(seg.startSeconds!)}s: ${promptText}`;
    } else if (hasDuration) {
      timingKind = "duration-only";
      line = `~${formatPromptSeconds(seg.durationSeconds!)}s: ${promptText}`;
    } else {
      timingKind = "none";
      line = `Segment ${index}: ${promptText}`;
    }

    return {
      index,
      label: seg.label,
      segmentType: seg.segmentType,
      promptText,
      startSeconds: seg.startSeconds,
      durationSeconds: seg.durationSeconds,
      endSeconds,
      timingKind,
      line,
    };
  });

  const hasTiming = lines.some((l) => l.timingKind !== "none");
  const hasMissingTiming = lines.some((l) => l.timingKind !== "full");
  const text = lines.map((l) => l.line).join("\n");

  return { lines, text, hasTiming, hasMissingTiming };
}
