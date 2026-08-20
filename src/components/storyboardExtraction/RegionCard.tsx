import Card from "@/components/Card";
import { getRegionColor } from "@/lib/storyboardExtraction/regionColors";
import { getContentCropBaseRect, type ContentCropBaseRects } from "@/lib/storyboardExtraction/contentCrop";
import { resizeExtractionRegion, reassignExtractionRegion, skipExtractionRegion, deleteExtractionRegion } from "@/actions/storyboardExtractionRegions";
import type { sequenceStoryboardExtractionRegions } from "@/db/schema";

type Region = typeof sequenceStoryboardExtractionRegions.$inferSelect;
type Shot = { id: number; shotCode: string | null; title: string };

type Props = {
  r: Region;
  index: number;
  editable: boolean;
  extractionId: number;
  returnToActive: string;
  isRealAutoFallback: boolean;
  isExplicitGrid: boolean;
  sequenceShots: Shot[];
  contentCropBaseRects: ContentCropBaseRects | undefined;
};

/** One region's card: status/confidence, edit form, Shot assignment, Skip/Delete (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function RegionCard({
  r,
  index: i,
  editable,
  extractionId,
  returnToActive,
  isRealAutoFallback,
  isExplicitGrid,
  sequenceShots,
  contentCropBaseRects,
}: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <div className="text-xs font-mono text-[#6e767d] w-16 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: getRegionColor(r.orderIndex) }}
              aria-hidden="true"
            />
            #{i + 1}
          </span>
          <div className={`mt-1 text-[9px] uppercase tracking-wider ${
            r.status === "extracted" ? "text-[#6b9e72]" : r.status === "skipped" ? "text-[#4b5158]" : r.status === "assigned" ? "text-[#5b93d6]" : "text-[#cda24f]"
          }`}>
            {r.status}
          </div>
          <div className="mt-1 text-[9px] text-[#4b5158]">{Math.round(r.confidence * 100)}% conf.</div>
          {r.detectionMode === "grid-fallback" && isRealAutoFallback && (
            <div className="mt-1 text-[9px] text-[#cda24f]">Grid fallback — review required</div>
          )}
          {r.detectionMode === "grid-fallback" && isExplicitGrid && (
            <div className="mt-1 text-[9px] text-[#6e767d]">Exact Grid</div>
          )}
          {!r.textSeparationDetected && (
            <div className="mt-1 text-[9px] text-[#4b5158]">Full cell (no caption split)</div>
          )}
        </div>

        {editable ? (
          <form action={resizeExtractionRegion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="extractionId" value={String(extractionId)} />
            <input type="hidden" name="regionId" value={String(r.id)} />
            <input type="hidden" name="returnTo" value={returnToActive} />
            {(() => {
              const base = getContentCropBaseRect(contentCropBaseRects, r.orderIndex, {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
              });
              return (["x", "y", "width", "height"] as const).map((field) => (
                <input
                  key={`base-${field}`}
                  type="hidden"
                  id={`region-${r.id}-base-${field}`}
                  value={base[field]}
                  readOnly
                />
              ));
            })()}
            {/* REVISE round 2 (finding #1) — separate stable base for Apply Ratio All in "Manual" mode: starts from this region's CURRENT rectangle (never the FIX5-detected cell), kept in sync with real manual edits only (RegionCropBox drag, direct field typing via ManualBaseSync) — never by an automated transformation's own output, which is what keeps repeated Apply Ratio All clicks idempotent. */}
            {(["x", "y", "width", "height"] as const).map((field) => (
              <input
                key={`manual-base-${field}`}
                type="hidden"
                id={`region-${r.id}-manual-base-${field}`}
                defaultValue={r[field]}
              />
            ))}
            {(["x", "y", "width", "height"] as const).map((field) => (
              <label key={field} className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">{field}</span>
                <input
                  type="number"
                  id={`region-${r.id}-${field}`}
                  name={field}
                  defaultValue={r[field]}
                  min={field === "x" || field === "y" ? 0 : 1}
                  className="w-20 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                />
              </label>
            ))}
            <button
              type="submit"
              className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Update
            </button>
            <label className="flex items-center gap-1 text-[10px] text-[#a4abb2]">
              <input type="checkbox" id={`region-${r.id}-lock-ratio`} />
              Lock ratio
            </label>
          </form>
        ) : (
          <div className="text-xs font-mono text-[#4b5158]">
            x={r.x} y={r.y} w={r.width} h={r.height}
          </div>
        )}

        <div className="flex items-end gap-2">
          {editable ? (
            <form action={reassignExtractionRegion} className="flex items-end gap-2">
              <input type="hidden" name="extractionId" value={String(extractionId)} />
              <input type="hidden" name="regionId" value={String(r.id)} />
              <input type="hidden" name="returnTo" value={returnToActive} />
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Shot</span>
                <select
                  name="targetShotId"
                  defaultValue={r.targetShotId ?? ""}
                  className="w-40 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                >
                  <option value="">— Unassigned —</option>
                  {sequenceShots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shotCode ?? s.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Assign
              </button>
            </form>
          ) : (
            <div className="text-xs text-[#4b5158]">
              {sequenceShots.find((s) => s.id === r.targetShotId)?.shotCode ?? "—"}
            </div>
          )}
        </div>

        {editable && (
          <div className="flex items-end gap-2 ml-auto">
            {r.status !== "skipped" && (
              <form action={skipExtractionRegion}>
                <input type="hidden" name="extractionId" value={String(extractionId)} />
                <input type="hidden" name="regionId" value={String(r.id)} />
                <input type="hidden" name="returnTo" value={returnToActive} />
                <button type="submit" className="text-[10px] text-[#cda24f] hover:text-[#e0b968] transition-colors">
                  Skip
                </button>
              </form>
            )}
            <form action={deleteExtractionRegion}>
              <input type="hidden" name="extractionId" value={String(extractionId)} />
              <input type="hidden" name="regionId" value={String(r.id)} />
              <input type="hidden" name="returnTo" value={returnToActive} />
              <button type="submit" className="text-[10px] text-[#cf7b6b] hover:text-[#e0958a] transition-colors">
                Delete
              </button>
            </form>
          </div>
        )}
      </div>
    </Card>
  );
}
