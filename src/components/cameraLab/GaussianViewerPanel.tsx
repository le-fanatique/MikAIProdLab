"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pc from "playcanvas";
import {
  checkCaptureResolution,
  type GpuCaptureLimits,
  type CaptureResolutionCheck,
} from "@/lib/cameraLab/captureGuard";
import { confirmCameraSnapshot } from "@/actions/cameraLabSnapshot";
import FieldTooltip from "@/components/FieldTooltip";
import {
  clampDepthScale,
  DEPTH_SCALE_DEFAULT,
  DEPTH_SCALE_MIN,
  DEPTH_SCALE_MAX,
  DEPTH_SCALE_STEP,
  transformLocalAabbToWorld,
  computeInitialOrbitFromAabb,
  normalizeWheelDelta,
  resolveWheelCoefficient,
  computeNextDollyDistance,
  ZOOM_SENSITIVITY_PRESETS,
  ZOOM_SENSITIVITY_DEFAULT,
  parseZoomSensitivityPreset,
  type ZoomSensitivityPreset,
  type Vec3Like,
} from "@/lib/cameraLab/viewerControls";

const ZOOM_SENSITIVITY_STORAGE_KEY = "mikai:camera-lab:zoom-sensitivity";

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
  /**
   * CAMLAB.POLISH.1 — optional: lifts the local snapshot draft to a parent
   * that needs it before "Add to Shot references" is clicked (Column 3,
   * Gaussian-to-image). Called with `null` on retake or after a successful
   * save. Never a substitute for `confirmCameraSnapshot` — the draft still
   * only becomes a Shot reference via that explicit action.
   */
  onSnapshotChange?: (snapshot: { objectUrl: string; width: number; height: number } | null) => void;
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

/** Converts the pure `{x,y,z}`-based orbit data from `viewerControls.ts` into a `pc.Vec3`-backed `OrbitState`. */
function orbitDataToState(data: { yaw: number; pitch: number; distance: number; target: Vec3Like }): OrbitState {
  return {
    yaw: data.yaw,
    pitch: data.pitch,
    distance: data.distance,
    target: new pc.Vec3(data.target.x, data.target.y, data.target.z),
  };
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
  onSnapshotChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<pc.Application | null>(null);
  const cameraEntityRef = useRef<pc.Entity | null>(null);
  const orbitRef = useRef<OrbitState | null>(null);
  const initialOrbitRef = useRef<OrbitState | null>(null);
  // CAMLAB.VIEWER.CONTROLS.1 — the splat entity and its ORIGINAL local-space
  // AABB (untransformed, exactly as read from the asset), so the depth
  // effect can recompute world bounds at any depthScale without re-reading
  // the asset or touching the main app-lifecycle effect's dependencies.
  const splatParentRef = useRef<pc.Entity | null>(null);
  const localAabbRef = useRef<{ center: Vec3Like; halfExtents: Vec3Like } | null>(null);

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

  // CAMLAB.VIEWER.CONTROLS.1 — depth correction, specific to this loaded PLY
  // (resets to 1.00 on every remount, since the parent keys this component
  // by job/reference and forces a fresh mount on PLY change).
  const [depthScale, setDepthScale] = useState(DEPTH_SCALE_DEFAULT);
  // Codex retake — the numeric field's own free-typing draft, distinct from
  // the committed `depthScale`. Never clamped on every keystroke: the user
  // can clear the field, type partial values like "0." or "0.5", and only
  // commits (clamp + apply) on blur or Enter. Kept in sync with the slider
  // and `Reset depth`, which both apply immediately (no free-typing there).
  const [depthInputDraft, setDepthInputDraft] = useState(DEPTH_SCALE_DEFAULT.toFixed(2));

  // Zoom sensitivity — a global interaction preference. First render is
  // always "Normal" (SSR-safe, no hydration mismatch); the persisted value
  // is only read from localStorage after mount, client-side.
  const [zoomSensitivity, setZoomSensitivity] = useState<ZoomSensitivityPreset>(ZOOM_SENSITIVITY_DEFAULT);
  const sensitivityRef = useRef<ZoomSensitivityPreset>(zoomSensitivity);
  sensitivityRef.current = zoomSensitivity;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ZOOM_SENSITIVITY_STORAGE_KEY);
      setZoomSensitivity(parseZoomSensitivityPreset(stored));
    } catch {
      // Absent/corrupt/unavailable storage — silently keep "Normal".
    }
  }, []);

  const selectZoomSensitivity = useCallback((preset: ZoomSensitivityPreset) => {
    setZoomSensitivity(preset);
    try {
      window.localStorage.setItem(ZOOM_SENSITIVITY_STORAGE_KEY, preset);
    } catch {
      // Storage unavailable (private browsing, quota) — preference still
      // applies for this session via React state, just not persisted.
    }
  }, []);

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
    // CAMLAB.VIEWER.CONTROLS.1 — depth correction is specific to this PLY;
    // a fresh app/asset load always starts from the original, uncorrected
    // depth (defensive — the parent already remounts this component on PLY
    // change via its key, which resets useState on its own).
    setDepthScale(DEPTH_SCALE_DEFAULT);
    setDepthInputDraft(DEPTH_SCALE_DEFAULT.toFixed(2));

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
    splatParentRef.current = splatParent;

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

      // Frame the scene from its real bounds when available. The RAW
      // local-space AABB (never rotated/scaled here) is kept in
      // `localAabbRef` so the depth-scale effect can recompute the world
      // bounds later at any `depthScale`, using the exact same transform
      // (180° X rotation + local Z scale) the splat entity itself carries —
      // never applied twice.
      const resource = asset.resource as unknown as {
        aabb?: { center: pc.Vec3; halfExtents: pc.Vec3 };
      } | null;
      const rawAabb = resource?.aabb ?? null;
      localAabbRef.current = rawAabb
        ? {
            center: { x: rawAabb.center.x, y: rawAabb.center.y, z: rawAabb.center.z },
            halfExtents: { x: rawAabb.halfExtents.x, y: rawAabb.halfExtents.y, z: rawAabb.halfExtents.z },
          }
        : null;
      const worldAabb = localAabbRef.current ? transformLocalAabbToWorld(localAabbRef.current, DEPTH_SCALE_DEFAULT) : null;
      const initial = orbitDataToState(computeInitialOrbitFromAabb(worldAabb));
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
      // Codex retake — must never let the page scroll on the canvas even
      // before the orbit is ready (asset still loading), so this is called
      // unconditionally on entry, BEFORE the orbit-readiness guard.
      e.preventDefault();
      const orbit = orbitRef.current;
      if (!orbit) return;
      // Sensitivity preset read from a ref (current value, no dependency on
      // the handler itself) so changing it never re-registers this listener
      // or recreates the PlayCanvas app.
      const normalizedDelta = normalizeWheelDelta(e.deltaY, e.deltaMode, window.innerHeight);
      const coefficient = resolveWheelCoefficient(sensitivityRef.current, e.altKey);
      orbit.distance = computeNextDollyDistance(orbit.distance, normalizedDelta, coefficient);
      applyOrbit();
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
      splatParentRef.current = null;
      localAabbRef.current = null;
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

  // ── Depth correction — deliberately its OWN effect, depending only on
  //    `depthScale`. Never touches `orbitRef` (the current camera pose
  //    stays stable while the slider moves) — only the entity's local Z
  //    scale and the bounds `resetCamera` will use NEXT time. Never in the
  //    main lifecycle effect's deps, so adjusting depth never recreates the
  //    PlayCanvas app or reloads the PLY. ─────────────────────────────────
  useEffect(() => {
    const splatParent = splatParentRef.current;
    if (!splatParent) return;
    const clamped = clampDepthScale(depthScale);
    // Non-uniform local scale, Z only — X/Y strictly unchanged. Never
    // touches the PLY file itself, only this entity's render transform.
    splatParent.setLocalScale(1, 1, clamped);

    const localAabb = localAabbRef.current;
    if (localAabb) {
      const worldAabb = transformLocalAabbToWorld(localAabb, clamped);
      initialOrbitRef.current = orbitDataToState(computeInitialOrbitFromAabb(worldAabb));
    }
  }, [depthScale]);

  const resetDepth = useCallback(() => {
    setDepthScale(DEPTH_SCALE_DEFAULT);
    setDepthInputDraft(DEPTH_SCALE_DEFAULT.toFixed(2));
  }, []);

  /** Parses and clamps the numeric field's free-typing draft on blur/Enter — invalid or empty input falls back to the current committed `depthScale`, never `0`. */
  const commitDepthDraft = useCallback(
    (raw: string) => {
      const parsed = Number(raw.trim());
      const next = raw.trim() !== "" && Number.isFinite(parsed) ? clampDepthScale(parsed) : depthScale;
      setDepthScale(next);
      setDepthInputDraft(next.toFixed(2));
    },
    [depthScale]
  );

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
        const next = { objectUrl: URL.createObjectURL(blob), width, height };
        setSnapshot(next);
        onSnapshotChange?.(next);
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
  }, [gpuCheck, sourceWidth, sourceHeight, onSnapshotChange]);

  const retake = useCallback(() => {
    const current = snapshotRef.current;
    if (current) URL.revokeObjectURL(current.objectUrl);
    setSnapshot(null);
    setCaptureError(null);
    setSaveError(null);
    onSnapshotChange?.(null);
  }, [onSnapshotChange]);

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
        onSnapshotChange?.(null);
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
  }, [saving, projectId, sequenceId, shotId, jobId, refId, onSnapshotChange]);

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
            Drag orbit · Shift/right-drag pan · Wheel dolly · Alt+Wheel fine dolly
          </div>
        )}
      </div>

      {/* Depth scale — non-destructive, this PLY only; resets to 1.00 on reload */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="camera-lab-depth-scale" className="text-xs text-[#a4abb2] shrink-0">
          Depth scale
        </label>
        <input
          id="camera-lab-depth-scale"
          type="range"
          min={DEPTH_SCALE_MIN}
          max={DEPTH_SCALE_MAX}
          step={DEPTH_SCALE_STEP}
          value={depthScale}
          disabled={!ready}
          onChange={(e) => {
            const next = clampDepthScale(Number(e.target.value));
            setDepthScale(next);
            setDepthInputDraft(next.toFixed(2));
          }}
          className="flex-1 min-w-[120px] accent-[#5b93d6] disabled:opacity-40"
        />
        {/* Codex retake — a free-typing text draft, not a native <input
            type="number">: clamping on every keystroke made it impossible to
            clear the field or type a value like "0.5" progressively
            (Number("") === 0 would immediately snap to the minimum). Only
            blur/Enter validate and clamp; Escape discards the in-progress
            edit and restores the committed value. */}
        <input
          type="text"
          inputMode="decimal"
          value={depthInputDraft}
          disabled={!ready}
          onChange={(e) => setDepthInputDraft(e.target.value)}
          onBlur={(e) => commitDepthDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitDepthDraft(e.currentTarget.value);
            } else if (e.key === "Escape") {
              setDepthInputDraft(depthScale.toFixed(2));
            }
          }}
          className="w-16 rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-1.5 py-1 text-right disabled:opacity-40"
          aria-label="Depth scale value"
        />
        <button
          type="button"
          onClick={resetDepth}
          disabled={!ready}
          title="Reset depth"
          className="rounded border border-[#2c3035] px-2.5 py-1 text-xs text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          Reset depth
        </button>
      </div>

      {/* Zoom sensitivity — global interaction preference, persisted.
          Codex retake — plain buttons with `aria-pressed`, the simpler
          alternative the ticket explicitly authorizes, instead of an
          incomplete `role="radio"` pattern (which would require arrow-key/
          Home/End roving-tabindex handling to be a valid ARIA radio group).
          The explanation is reachable via mouse hover AND keyboard focus
          through the existing `FieldTooltip` component (`title` alone is
          hover-only, never focus-reachable). */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[#a4abb2] shrink-0 inline-flex items-center gap-1.5">
          Zoom sensitivity
          <FieldTooltip text="Adjust how far the camera moves for each wheel step." />
        </span>
        <div className="inline-flex rounded border border-[#2c3035] overflow-hidden">
          {ZOOM_SENSITIVITY_PRESETS.map((preset) => {
            const active = zoomSensitivity === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => selectZoomSensitivity(preset)}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "bg-[#14202e] text-[#e7e9ec]"
                    : "text-[#a4abb2] hover:text-[#e7e9ec] hover:bg-[#1a1d20]"
                }`}
              >
                {preset}
              </button>
            );
          })}
        </div>
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
