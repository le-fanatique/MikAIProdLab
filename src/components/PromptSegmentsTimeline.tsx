const SEGMENT_PALETTE = ["#5b93d6", "#6aa6a0", "#9bb05a", "#cda24f", "#cf8b6b"];
const TOLERANCE = 0.001;

type SegmentForTimeline = {
  id: number;
  label: string | null;
  startSeconds: number | null;
  durationSeconds: number | null;
  segmentType: string | null;
};

type TimedSegment = SegmentForTimeline & {
  startSeconds: number;
  durationSeconds: number;
};

function isTimedSegment(s: SegmentForTimeline): s is TimedSegment {
  return s.startSeconds !== null && s.durationSeconds !== null;
}

function getTimelineWarnings(
  timedSegments: TimedSegment[],
  untimedCount: number,
  shotDurationSeconds: number
): string[] {
  const warnings: string[] = [];

  if (untimedCount > 0) {
    warnings.push(
      `Missing timing on ${untimedCount} segment${untimedCount !== 1 ? "s" : ""}`
    );
  }

  const invalidDurCount = timedSegments.filter((s) => s.durationSeconds <= 0).length;
  if (invalidDurCount > 0) {
    warnings.push(
      `Invalid duration on ${invalidDurCount} segment${invalidDurCount !== 1 ? "s" : ""}`
    );
  }

  if (timedSegments.length === 0) return warnings;

  if (timedSegments[0].startSeconds > TOLERANCE) {
    warnings.push(
      `Timeline starts at ${timedSegments[0].startSeconds.toFixed(1)}s, not 0s`
    );
  }

  for (let i = 1; i < timedSegments.length; i++) {
    const prev = timedSegments[i - 1];
    const next = timedSegments[i];
    const endPrev = prev.startSeconds + prev.durationSeconds;
    const startNext = next.startSeconds;

    if (startNext > endPrev + TOLERANCE) {
      warnings.push(`Gap from ${endPrev.toFixed(1)}s to ${startNext.toFixed(1)}s`);
    } else if (startNext < endPrev - TOLERANCE) {
      warnings.push(`Overlap near ${startNext.toFixed(1)}s`);
    }
  }

  const lastSeg = timedSegments[timedSegments.length - 1];
  const lastEnd = lastSeg.startSeconds + lastSeg.durationSeconds;

  if (lastEnd < shotDurationSeconds - TOLERANCE) {
    warnings.push(
      `Timeline ends at ${lastEnd.toFixed(1)}s, shot duration is ${shotDurationSeconds.toFixed(1)}s`
    );
  } else if (lastEnd > shotDurationSeconds + TOLERANCE) {
    warnings.push(
      `Timeline exceeds shot duration by ${(lastEnd - shotDurationSeconds).toFixed(1)}s`
    );
  }

  return warnings;
}

function UntimedZone({ segments }: { segments: SegmentForTimeline[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] text-[#4b5158]">Untimed segments</span>
      <div className="flex flex-wrap gap-1.5">
        {segments.map((seg) => (
          <span
            key={seg.id}
            className="text-[10px] font-mono text-[#3a4046] border border-dashed border-[#1a1d20] rounded px-1.5 py-0.5"
          >
            {seg.label ?? "Untitled"}
          </span>
        ))}
      </div>
    </div>
  );
}

type Props = {
  segments: SegmentForTimeline[];
  shotDurationSeconds: number | null;
};

export default function PromptSegmentsTimeline({ segments, shotDurationSeconds }: Props) {
  if (segments.length === 0) return null;

  const timedSegments = segments
    .filter(isTimedSegment)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const untimedSegments = segments.filter((s) => !isTimedSegment(s));

  if (shotDurationSeconds == null) {
    return (
      <div className="mt-3 pt-3 border-t border-[#1a1d20] flex flex-col gap-2">
        <p className="text-[10px] text-[#4b5158]">
          Set a shot duration to preview the prompt timeline.
        </p>
        {untimedSegments.length > 0 && <UntimedZone segments={untimedSegments} />}
      </div>
    );
  }

  if (shotDurationSeconds <= 0) {
    return (
      <div className="mt-3 pt-3 border-t border-[#1a1d20]">
        <p className="text-[10px] text-[#cda24f]">
          Shot duration must be greater than 0 to preview the prompt timeline.
        </p>
      </div>
    );
  }

  const warnings = getTimelineWarnings(timedSegments, untimedSegments.length, shotDurationSeconds);
  const allOk = warnings.length === 0 && timedSegments.length > 0;
  const coveredSeconds = timedSegments.reduce((sum, s) => sum + s.durationSeconds, 0);

  return (
    <div className="mt-3 pt-3 border-t border-[#1a1d20] flex flex-col gap-3">
      {/* Coverage chip */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-[#4b5158]">Coverage</span>
        <span
          className={`text-[10px] font-mono ${
            allOk ? "text-[#5fa37a]" : "text-[#cda24f]"
          }`}
        >
          {coveredSeconds.toFixed(1)}s / {shotDurationSeconds.toFixed(1)}s
        </span>
        {allOk && (
          <span className="text-[9px] text-[#5fa37a]">✓ Timeline looks complete</span>
        )}
      </div>

      {/* Soft validation warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {warnings.map((w, i) => (
            <span key={i} className="text-[10px] text-[#cda24f]">
              · {w}
            </span>
          ))}
        </div>
      )}

      {/* Timeline lane */}
      {timedSegments.length > 0 && (
        <div>
          <div
            className="relative rounded border border-[#1a1d20] bg-[#0d0e10] overflow-hidden"
            style={{ height: "52px" }}
          >
            {timedSegments.map((seg, i) => {
              const rawLeft =
                (seg.startSeconds / shotDurationSeconds) * 100;
              const rawRight =
                ((seg.startSeconds + seg.durationSeconds) / shotDurationSeconds) * 100;
              const visualLeft = Math.max(0, Math.min(100, rawLeft));
              const visualRight = Math.max(0, Math.min(100, rawRight));
              const visualWidth = Math.max(0, visualRight - visualLeft);

              if (visualWidth <= 0) return null;

              const color = SEGMENT_PALETTE[i % SEGMENT_PALETTE.length];
              const endLabel = (seg.startSeconds + seg.durationSeconds).toFixed(1);

              return (
                <div
                  key={seg.id}
                  className="absolute top-0 bottom-0 overflow-hidden flex flex-col justify-between px-1.5 py-1.5 border-r border-r-[#1a1d20] last:border-r-0"
                  style={{
                    left: `${visualLeft}%`,
                    width: `${visualWidth}%`,
                    borderTop: `2px solid ${color}`,
                  }}
                  title={`${seg.label ?? `Segment ${i + 1}`} · ${seg.startSeconds.toFixed(1)}s–${endLabel}s`}
                >
                  <span
                    className="text-[9px] font-mono truncate leading-none"
                    style={{ color }}
                  >
                    {seg.label ?? `Seg ${i + 1}`}
                  </span>
                  <span className="text-[9px] font-mono text-[#4b5158] tabular-nums leading-none truncate">
                    {seg.startSeconds.toFixed(1)}–{endLabel}s
                  </span>
                </div>
              );
            })}
          </div>
          {/* Ruler */}
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] font-mono text-[#3a4046]">0s</span>
            <span className="text-[9px] font-mono text-[#3a4046]">
              {shotDurationSeconds.toFixed(1)}s
            </span>
          </div>
        </div>
      )}

      {/* Untimed segments */}
      {untimedSegments.length > 0 && <UntimedZone segments={untimedSegments} />}
    </div>
  );
}
