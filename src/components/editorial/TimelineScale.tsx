// Pick a tick step giving at most ~8 labeled graduations
function tickStep(total: number): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const step of candidates) {
    if (total / step <= 8) return step;
  }
  return 600;
}

type Props = {
  total: number;
};

/** Timeline scale — labeled graduations, identical for the items lane and the legacy lane (IND.CLIENTSPLIT.1, moved verbatim from EditorialTimeline.tsx, previously duplicated once per lane). */
export default function TimelineScale({ total }: Props) {
  const step = tickStep(total);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += step) ticks.push(t);
  return (
    <div className="relative mt-1" style={{ height: "14px" }}>
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute text-[9px] font-mono text-[#3a4046] -translate-x-1/2 first:translate-x-0"
          style={{ left: `${Math.min((t / total) * 100, 100)}%` }}
        >
          {t.toFixed(0)}s
        </span>
      ))}
      <span className="absolute right-0 text-[9px] font-mono text-[#4b5158]">
        {total.toFixed(1)}s
      </span>
    </div>
  );
}
