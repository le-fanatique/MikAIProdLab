"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pc from "playcanvas";
import {
  checkCaptureResolution,
  type GpuCaptureLimits,
  type CaptureResolutionCheck,
} from "@/lib/cameraLab/captureGuard";
import { confirmCameraSnapshot } from "@/actions/cameraLabSnapshot";

type Props = {
  /** Verified server-side by the Camera Lab page — never derived client-side. */
  projectId: number;
  sequenceId: number;
  shotId: number;
  jobId: number;
  refId: number;
  plyUrl: string;
  plyLabel: string;
  sourceImageLabel: string;
  sourceWidth: number;
  sourceHeight: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

type Snapshot = {
  objectUrl: string;
  width: number;
  height: number;
};

type OrbitState = {
  yaw: number;
  pitch: number;
  distance: number;
  target: pc.Vec3;
};

/**
 * SHARP PLY scenes use an OpenCV-style camera convention (x right, y down,
 * z forward from the source camera at the origin). PlayCanvas is y-up with
 * the camera looking down -z, so the splat container is rotated 180° around
 * X: the scene then sits in front of a PlayCanvas camera at the origin with
 * an identity orientation. Verified against the real SHARP PLY (see the
 * CAMLAB.VIEWER.1 report), not a fictional convention.
 */
const SHARP_TO_PLAYCANVAS_X_ROTATION_DEG = 180;

function computeInitialOrbit(aabb: { center: pc.Vec3; halfExtents: pc.Vec3 } | null): OrbitState {
  if (aabb) {
    const radius = Math.max(aabb.halfExtents.length(), 0.1);
    return {
      yaw: 0,
      pitch: 0,
      distance: Math.max(radius * 0.9, 0.3),
      target: aabb.center.clone(),
    };
  }
  return { yaw: 0, pitch: 0, distance: 2, target: new pc.Vec3(0, 0, -2) };
}

export default function GaussianViewerPanel({
  projectId,
  sequenceId,
  shotId,
  jobId,
  refId,
  plyUrl,
  plyLabel,
  sourceImageLabel,
  sourceWidth,
  sourceHeight,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<pc.Application | null>(null);
  const cameraEntityRef = useRef<pc.Entity | null>(null);
  const orbitRef = useRef<OrbitState | null>(null);
  const initialOrbitRef = useRef<OrbitState | null>(null);

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [gpuCheck, setGpuCheck] = useState<CaptureResolutionCheck | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{ referenceId: number; width: number; height: number } | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  snapshotRef.current = snapshot;

  const applyOrbit = useCallback(() => {
    const orbit = orbitRef.current;
    const cameraEntity = cameraEntityRef.current;
    if (!orbit || !cameraEntity) return;
    const yawRad = (orbit.yaw * Math.PI) / 180;
    const pitchRad = (orbit.pitch * Math.PI) / 180;
    const cosPitch = Math.cos(pitchRad);
    const offset = new pc.Vec3(
      orbit.distance * cosPitch * Math.sin(yawRad),
      orbit.distance * Math.sin(pitchRad),
      orbit.distance * cosPitch * Math.cos(yawRad)
    );
    const position = new pc.Vec3().add2(orbit.target, offset);
    cameraEntity.setPosition(position);
    cameraEntity.lookAt(orbit.target);
  }, []);

  const resetCamera = useCallback(() => {
    const initial = initialOrbitRef.current;
    if (!initial) return;
    orbitRef.current = {
      yaw: initial.yaw,
      pitch: initial.pitch,
      distance: initial.distance,
      target: initial.target.clone(),
    };
    applyOrbit();
  }, [applyOrbit]);

  // ── PlayCanvas lifecycle — one application per mounted PLY ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    setLoadState({ status: "loading" });
    setGpuCheck(null);
    setCaptureError(null);

    let disposed = false;
    let app: pc.Application | null = null;
    let loadedAsset: pc.Asset | null = null;

    try {
      app = new pc.Application(canvas, {
        graphicsDeviceOptions: { alpha: false, antialias: true, preserveDrawingBuffer: false },
      });
    } catch (err) {
      setLoadState({
        status: "error",
        message: `WebGL initialization failed: ${err instanceof Error ? err.message : "unknown error"}. A GPU-capable browser is required.`,
      });
      return;
    }
    appRef.current = app;
    // Lifecycle instrumentation (validated in the ticket's lifecycle proof).
    const w = window as unknown as { __mikaiCameraLabApps?: number };
    w.__mikaiCameraLabApps = (w.__mikaiCameraLabApps ?? 0) + 1;

    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // Real GPU limits for the exact-capture guard.
    try {
      const device = app.graphicsDevice as unknown as {
        maxRenderBufferSize?: number;
        maxTextureSize?: number;
        gl?: WebGL2RenderingContext;
      };
      const gl = device.gl;
      const viewportDims = gl
        ? (gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)
        : null;
      const limits: GpuCaptureLimits = {
        maxRenderBufferSize:
          device.maxRenderBufferSize ??
          (gl ? (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number) : 0),
        maxTextureSize:
          device.maxTextureSize ??
          (gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 0),
        maxViewportWidth: viewportDims ? viewportDims[0] : 0,
        maxViewportHeight: viewportDims ? viewportDims[1] : 0,
      };
      setGpuCheck(checkCaptureResolution(sourceWidth, sourceHeight, limits));
    } catch {
      setGpuCheck({ ok: false, reason: "GPU limits could not be read from the WebGL context." });
    }

    const cameraEntity = new pc.Entity("camera");
    cameraEntity.addComponent("camera", {
      clearColor: new pc.Color(0.055, 0.063, 0.07),
      fov: 45,
      nearClip: 0.01,
      farClip: 1000,
    });
    app.root.addChild(cameraEntity);
    cameraEntityRef.current = cameraEntity;

    const splatParent = new pc.Entity("sharp-splat");
    splatParent.setEulerAngles(SHARP_TO_PLAYCANVAS_X_ROTATION_DEG, 0, 0);
    app.root.addChild(splatParent);

    app.start();

    const resize = () => {
      if (disposed || !app) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        app.resizeCanvas(rect.width, rect.height);
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    app.assets.loadFromUrlAndFilename(plyUrl, "scene.ply", "gsplat", (err, asset) => {
      if (disposed) return;
      if (err || !asset) {
        setLoadState({
          status: "error",
          message: `Failed to load the Gaussian PLY: ${err ?? "unknown error"}.`,
        });
        return;
      }
      loadedAsset = asset;
      splatParent.addComponent("gsplat", { asset });

      // Frame the scene from its real bounds when available.
      const resource = asset.resource as unknown as {
        aabb?: { center: pc.Vec3; halfExtents: pc.Vec3 };
      } | null;
      let aabb = resource?.aabb ?? null;
      if (aabb) {
        // The container is rotated 180° about X — mirror the local-space
        // bounds into world space so the initial orbit looks at the scene.
        aabb = {
          center: new pc.Vec3(aabb.center.x, -aabb.center.y, -aabb.center.z),
          halfExtents: aabb.halfExtents.clone(),
        };
      }
      const initial = computeInitialOrbit(aabb);
      initialOrbitRef.current = initial;
      orbitRef.current = {
        yaw: initial.yaw,
        pitch: initial.pitch,
        distance: initial.distance,
        target: initial.target.clone(),
      };
      applyOrbit();
      setLoadState({ status: "ready" });
    });

    // ── Camera controls: orbit (drag), pan (right/middle or Shift+drag),
    //    dolly (wheel) ────────────────────────────────────────────────────
    let activePointer: number | null = null;
    let panMode = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (activePointer !== null) return;
      activePointer = e.pointerId;
      panMode = e.button === 1 || e.button === 2 || e.shiftKey;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      const orbit = orbitRef.current;
      const cameraEntity2 = cameraEntityRef.current;
      if (!orbit || !cameraEntity2) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (panMode) {
        const scale = orbit.distance * 0.0016;
        const right = cameraEntity2.right.clone().mulScalar(-dx * scale);
        const up = cameraEntity2.up.clone().mulScalar(dy * scale);
        orbit.target.add(right).add(up);
      } else {
        orbit.yaw -= dx * 0.25;
        orbit.pitch = Math.min(89, Math.max(-89, orbit.pitch + dy * 0.25));
      }
      applyOrbit();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      const orbit = orbitRef.current;
      if (!orbit) return;
      orbit.distance = Math.min(500, Math.max(0.05, orbit.distance * Math.exp(e.deltaY * 0.0011)));
      applyOrbit();
      e.preventDefault();
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      cameraEntityRef.current = null;
      orbitRef.current = null;
      initialOrbitRef.current = null;
      if (loadedAsset) {
        loadedAsset.unload();
        app?.assets.remove(loadedAsset);
      }
      app?.destroy();
      appRef.current = null;
      const w2 = window as unknown as { __mikaiCameraLabApps?: number };
      w2.__mikaiCameraLabApps = Math.max(0, (w2.__mikaiCameraLabApps ?? 1) - 1);
      const stale = snapshotRef.current;
      if (stale) URL.revokeObjectURL(stale.objectUrl);
    };
    // sourceWidth/sourceHeight only feed the GPU guard; the guard re-runs via
    // a full remount because the parent keys this panel by PLY + reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plyUrl, applyOrbit]);

  // ── Exact offscreen capture ───────────────────────────────────────────────
  const captureSnapshot = useCallback(async () => {
    const app = appRef.current;
    const cameraEntity = cameraEntityRef.current;
    if (!app || !cameraEntity || !cameraEntity.camera) return;
    if (!gpuCheck || !gpuCheck.ok) return;

    setCapturing(true);
    setCaptureError(null);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const device = app.graphicsDevice;
      const width = sourceWidth;
      const height = sourceHeight;

      const colorBuffer = new pc.Texture(device, {
        name: "camera-lab-capture",
        width,
        height,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: false,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
      });
      const renderTarget = new pc.RenderTarget({
        name: "camera-lab-capture-rt",
        colorBuffer,
        depth: true,
        samples: 1,
      });

      const camera = cameraEntity.camera;
      const previousAspectMode = camera.aspectRatioMode;
      const previousAspect = camera.aspectRatio;
      try {
        // Same pose, same FOV — only the render target and the exact aspect
        // (identical to the viewport's CSS ratio) are set for this render.
        camera.aspectRatioMode = pc.ASPECT_MANUAL;
        camera.aspectRatio = width / height;
        camera.renderTarget = renderTarget;
        app.render();

        const pixels = new Uint8Array(width * height * 4);
        const deviceWithRt = device as unknown as {
          setRenderTarget: (rt: pc.RenderTarget | null) => void;
          updateBegin: () => void;
          updateEnd: () => void;
          readPixels: (x: number, y: number, w: number, h: number, p: ArrayBufferView) => void;
        };
        deviceWithRt.setRenderTarget(renderTarget);
        deviceWithRt.updateBegin();
        deviceWithRt.readPixels(0, 0, width, height, pixels);
        deviceWithRt.updateEnd();
        deviceWithRt.setRenderTarget(null);

        // WebGL rows are bottom-up — flip into a 2D canvas of the exact size.
        const outCanvas = document.createElement("canvas");
        outCanvas.width = width;
        outCanvas.height = height;
        const ctx = outCanvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas context unavailable for PNG encoding.");
        const imageData = ctx.createImageData(width, height);
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) {
          const src = (height - 1 - y) * rowBytes;
          imageData.data.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
        }
        // Opaque output — the capture camera clears with an opaque color.
        for (let i = 3; i < imageData.data.length; i += 4) imageData.data[i] = 255;
        ctx.putImageData(imageData, 0, 0);

        const blob = await new Promise<Blob | null>((resolve) =>
          outCanvas.toBlob(resolve, "image/png")
        );
        if (!blob) throw new Error("PNG encoding failed.");

        const previous = snapshotRef.current;
        if (previous) URL.revokeObjectURL(previous.objectUrl);
        setSnapshot({ objectUrl: URL.createObjectURL(blob), width, height });
      } finally {
        camera.renderTarget = null as unknown as pc.RenderTarget;
        camera.aspectRatioMode = previousAspectMode;
        camera.aspectRatio = previousAspect;
        renderTarget.destroy();
        colorBuffer.destroy();
      }
    } catch (err) {
      setCaptureError(
        `Capture failed: ${err instanceof Error ? err.message : "unknown error"}.`
      );
    } finally {
      setCapturing(false);
    }
  }, [gpuCheck, sourceWidth, sourceHeight]);

  const retake = useCallback(() => {
    const current = snapshotRef.current;
    if (current) URL.revokeObjectURL(current.objectUrl);
    setSnapshot(null);
    setCaptureError(null);
    setSaveError(null);
  }, []);

  // ── Explicit confirmation: add the local draft as a `camera` reference.
  //    Success only after the real server response; the draft survives any
  //    failure, and is released (Object URL revoked) only on success. ──────
  const addToShotReferences = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await (await fetch(current.objectUrl)).blob();
      const file = new File([blob], "gaussian-camera-snapshot.png", { type: "image/png" });
      const result = await confirmCameraSnapshot({
        projectId,
        sequenceId,
        shotId,
        jobId,
        refId,
        imageFile: file,
      });
      if (result.ok) {
        URL.revokeObjectURL(current.objectUrl);
        setSnapshot(null);
        setSaveSuccess({ referenceId: result.referenceId, width: result.width, height: result.height });
      } else {
        setSaveError(result.error);
      }
    } catch (err) {
      setSaveError(
        `Saving failed: ${err instanceof Error ? err.message : "unknown error"}. The local draft is kept.`
      );
    } finally {
      setSaving(false);
    }
  }, [saving, projectId, sequenceId, shotId, jobId, refId]);

  const ready = loadState.status === "ready";
  const captureBlocked = gpuCheck !== null && !gpuCheck.ok;

  return (
    <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
      {/* Status line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#6e767d]">
        <span className="font-mono">{plyLabel}</span>
        <span>
          Target: <span className="text-[#a4abb2]">{sourceImageLabel}</span>{" "}
          <span className="font-mono text-[#a4abb2]">{sourceWidth} × {sourceHeight}</span>
        </span>
        {loadState.status === "loading" && <span className="text-[#c9a24b]">Loading PLY…</span>}
        {ready && <span className="text-[#6b9e72]">PLY loaded</span>}
      </div>

      {loadState.status === "error" && (
        <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
          {loadState.message}
        </p>
      )}
      {captureBlocked && gpuCheck && !gpuCheck.ok && (
        <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
          {gpuCheck.reason}
        </p>
      )}

      {/* Viewport — CSS size is responsive, but the aspect ratio is locked to
          the source image; capture resolution never derives from this size. */}
      <div
        ref={containerRef}
        className="relative w-full max-h-[70vh] overflow-hidden rounded border border-[#2c3035]"
        style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
      >
        <canvas ref={canvasRef} className="h-full w-full touch-none" />
        {ready && (
          <div className="pointer-events-none absolute bottom-1.5 left-2 text-[9px] text-[#6e767d]">
            Drag orbit · Shift/right-drag pan · Wheel dolly
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resetCamera}
          disabled={!ready || saving}
          title="Reset camera"
          aria-label="Reset camera"
          className="rounded border border-[#2c3035] px-2.5 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ⟲
        </button>
        <button
          type="button"
          onClick={captureSnapshot}
          disabled={!ready || capturing || captureBlocked || saving}
          className="rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {capturing ? "Capturing…" : "Capture snapshot"}
        </button>
        {captureError && <span className="text-xs text-[#cf7b6b]">{captureError}</span>}
      </div>

      {/* Snapshot preview — local draft until explicitly confirmed */}
      {snapshot && (
        <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
          <p className="text-xs text-[#a4abb2]">
            Snapshot captured at{" "}
            <span className="font-mono text-[#e7e9ec]">
              {snapshot.width} × {snapshot.height}
            </span>{" "}
            — local draft. Add it to this Shot's references, or retake.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot.objectUrl}
            alt={`Snapshot at ${snapshot.width} x ${snapshot.height}`}
            className="max-h-[40vh] w-auto max-w-full rounded border border-[#2c3035] object-contain self-start"
          />
          {saveError && (
            <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
              {saveError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={addToShotReferences}
              disabled={saving}
              className="rounded border border-[#2c6142] bg-[#12241a] px-3 py-1.5 text-sm text-[#8fc9a0] hover:border-[#3a8158] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Add to Shot references"}
            </button>
            <button
              type="button"
              onClick={retake}
              disabled={saving}
              className="rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Retake
            </button>
          </div>
        </div>
      )}

      {/* Confirmed — real server success only */}
      {saveSuccess && !snapshot && (
        <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
          <p className="text-xs text-[#6b9e72]">
            Snapshot added to this Shot's Reference Images as{" "}
            <span className="font-mono">Camera</span> (
            <span className="font-mono">{saveSuccess.width} × {saveSuccess.height}</span>
            ). Capture another framing, or go back to the Shot.
          </p>
          <a
            href={`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors self-start"
          >
            ← Back to Shot
          </a>
        </div>
      )}
    </div>
  );
}
