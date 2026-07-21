"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// WebGL viewer is client-only — never SSR'd (no window/canvas on the server).
const GaussianViewerPanel = dynamic(() => import("./GaussianViewerPanel"), {
  ssr: false,
  loading: () => (
    <p className="text-xs text-[#6e767d]">Loading Gaussian viewer…</p>
  ),
});

type Props = {
  /** Verified server-side by the Camera Lab page — never derived client-side. */
  projectId: number;
  sequenceId: number;
  shotId: number;
  jobId: number;
  refId: number;
  plyUrl: string;
  plyLabel: string;
  sourceImageUrl: string;
  sourceImageLabel: string;
};

type SourceDimensions =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; width: number; height: number };

/**
 * Measures the chosen source image's intrinsic resolution in the browser
 * (shot_reference_images stores no dimensions), then mounts the viewer with
 * that exact capture target.
 */
export default function CameraLabWorkspace({
  projectId,
  sequenceId,
  shotId,
  jobId,
  refId,
  plyUrl,
  plyLabel,
  sourceImageUrl,
  sourceImageLabel,
}: Props) {
  const [dims, setDims] = useState<SourceDimensions>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setDims({ status: "loading" });
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDims({ status: "ready", width: img.naturalWidth, height: img.naturalHeight });
      } else {
        setDims({ status: "error" });
      }
    };
    img.onerror = () => {
      if (!cancelled) setDims({ status: "error" });
    };
    img.src = sourceImageUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
  }, [sourceImageUrl]);

  if (dims.status === "loading") {
    return (
      <p className="text-xs text-[#6e767d]">Reading source image dimensions…</p>
    );
  }
  if (dims.status === "error") {
    return (
      <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
        The selected source image could not be loaded, so its dimensions are
        unknown. Choose another source image.
      </p>
    );
  }

  return (
    <GaussianViewerPanel
      projectId={projectId}
      sequenceId={sequenceId}
      shotId={shotId}
      jobId={jobId}
      refId={refId}
      plyUrl={plyUrl}
      plyLabel={plyLabel}
      sourceImageLabel={sourceImageLabel}
      sourceWidth={dims.width}
      sourceHeight={dims.height}
    />
  );
}
