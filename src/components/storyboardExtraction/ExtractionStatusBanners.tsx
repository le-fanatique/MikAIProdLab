import type { DetectionDiagnostics } from "@/lib/storyboardExtraction/workerContract";
import type { ContentCropBaseRects } from "@/lib/storyboardExtraction/contentCrop";

type DetectionParamsSummary = {
  engine?: string;
  /** Legacy pre-FIX6 field, kept read-only for backward-compat banner logic below (old extractions have no `diagnostics`). */
  mode?: string;
  columns?: number | null;
  rows?: number | null;
  sensitivity?: string;
  customThreshold?: number | null;
  advancedParams?: Record<string, number>;
  expectedShotCount?: number;
  padding?: number;
  contentCrop?: { mode?: string; headerPercent?: number | null; captionPercent?: number | null };
  contentCropBaseRects?: ContentCropBaseRects;
  diagnostics?: DetectionDiagnostics;
} | null;

type Props = {
  extractError: string | null;
  okMessage: string | null;
  status: "detecting" | "ready" | "failed" | "confirmed";
  errorMessage: string | null;
  isRealAutoFallback: boolean;
  diagnostics: DetectionDiagnostics | undefined;
  sequenceShotsCount: number;
  isExplicitGrid: boolean;
  isAmbiguousSingleRegion: boolean;
  detectionParamsSummary: DetectionParamsSummary;
};

/** Status/error/info banners shown above Detection Settings (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function ExtractionStatusBanners({
  extractError,
  okMessage,
  status,
  errorMessage,
  isRealAutoFallback,
  diagnostics,
  sequenceShotsCount,
  isExplicitGrid,
  isAmbiguousSingleRegion,
  detectionParamsSummary,
}: Props) {
  return (
    <>
      {extractError && <p className="text-xs text-[#cf7b6b] mb-4">{extractError}</p>}
      {okMessage && <p className="text-xs text-[#6b9e72] mb-4">{okMessage}</p>}

      {status === "detecting" && (
        <p className="text-xs text-[#cda24f] mb-4">Detecting panels…</p>
      )}

      {status === "failed" && (
        <p className="text-xs text-[#cf7b6b] mb-4">
          Detection failed: {errorMessage ?? "Unknown error."}
        </p>
      )}

      {status === "confirmed" && (
        <p className="text-xs text-[#6b9e72] mb-4">
          This extraction was already confirmed. Extracted crops are visible in the Storyboard grid for their
          assigned Shots.
        </p>
      )}

      {isRealAutoFallback && (
        <p className="text-xs text-[#cda24f] mb-4">
          Automatic panel detection ({diagnostics?.primaryEngine ?? "Otsu/Canny"}) was ambiguous for this image
          {diagnostics?.fallbackReason ? ` (${diagnostics.fallbackReason})` : ""}, so a grid was proposed instead,
          sized to match this Sequence&apos;s {sequenceShotsCount} Shots. Every proposed region is low-confidence
          and stays unassigned until you review and explicitly assign it — nothing here is extracted automatically.
        </p>
      )}

      {isExplicitGrid && (
        <p className="text-xs text-[#6e767d] mb-4">
          This extraction used the <span className="text-[#a4abb2]">Exact Grid</span> engine — a deterministic
          geometric grid, not automatic visual detection. Nothing was ambiguous; review and assign regions as usual.
        </p>
      )}

      {isAmbiguousSingleRegion && (
        <p className="text-xs text-[#cf7b6b] mb-4">
          Detection found only one region, but this Sequence has {sequenceShotsCount} Shots. Use{" "}
          <span className="text-[#a4abb2]">Add Region</span> below to create the missing panels manually.
        </p>
      )}

      {detectionParamsSummary && (
        <div className="text-[10px] text-[#4b5158] mb-4 flex flex-col gap-0.5">
          <p>
            Detection engine: {detectionParamsSummary.engine ?? "canny"}
            {detectionParamsSummary.columns && detectionParamsSummary.rows
              ? ` (${detectionParamsSummary.columns}×${detectionParamsSummary.rows})`
              : ""}
            {detectionParamsSummary.customThreshold != null
              ? `, Custom threshold: ${detectionParamsSummary.customThreshold}`
              : detectionParamsSummary.sensitivity
                ? `, Sensitivity: ${detectionParamsSummary.sensitivity}`
                : ""}
            {detectionParamsSummary.expectedShotCount != null ? `, expected ${detectionParamsSummary.expectedShotCount} Shots` : ""}
            {detectionParamsSummary.contentCrop?.mode
              ? `. Content Crop: ${detectionParamsSummary.contentCrop.mode}` +
                (detectionParamsSummary.contentCrop.headerPercent != null
                  ? ` (header ${detectionParamsSummary.contentCrop.headerPercent}%, caption ${detectionParamsSummary.contentCrop.captionPercent}%)`
                  : "")
              : ""}
          </p>
          {detectionParamsSummary.diagnostics && (
            <p>
              Diagnostics — primary: {detectionParamsSummary.diagnostics.primaryEngine}, detected:{" "}
              {detectionParamsSummary.diagnostics.detectedCount}, confidence: {detectionParamsSummary.diagnostics.confidence}
              {detectionParamsSummary.diagnostics.threshold != null
                ? `, threshold: ${detectionParamsSummary.diagnostics.threshold}`
                : ""}
              , final engine: {detectionParamsSummary.diagnostics.finalEngine}
              {detectionParamsSummary.diagnostics.fallbackTriggered
                ? ` — fallback triggered (${detectionParamsSummary.diagnostics.fallbackReason ?? "unspecified reason"})`
                : ""}
            </p>
          )}
        </div>
      )}
    </>
  );
}
