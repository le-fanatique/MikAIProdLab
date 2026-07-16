#!/usr/bin/env python3
"""
opencv_storyboard_extract.py — SEQGEN.STORYBOARD.EXTRACT.1 / -FIX1 / -FIX3 / -FIX6

Detects bordered/gutter-separated panels ("cells") in a Sequence Storyboard
contact-sheet image, and crops confirmed regions on request. Talks to the
Node server exclusively via a strict JSON contract on stdout — never writes
to public/uploads directly (the server action owns validating and copying
any output file into permanent storage).

Two subcommands:

  detect --input <path> [--max-cells N] [--expected-shots N]
         [--engine otsu|canny|grid] [--columns N] [--rows N]
         [--sensitivity low|medium|high] [--custom-threshold F]
         [... ~15 advanced tunables, see build_arg_parser() ...]
    Analyzes the image and prints a JSON object describing candidate
    regions, in reading order (top-to-bottom, left-to-right), each with a
    confidence score and a best-effort illustration/caption split, plus a
    structured "diagnostics" object (FIX6): primaryEngine, detectedCount,
    confidence, threshold, fallbackTriggered, fallbackReason, finalEngine.
    The Node caller must read diagnostics from this field only — never by
    parsing stderr/log text.

    `--engine` (FIX6, replaces the old `--mode auto|grid` flag) selects the
    PRIMARY detection algorithm:

      `otsu`  — the original SEQGEN.STORYBOARD.EXTRACT.1 pipeline: a single
                global Otsu threshold splits background from content: no
                edge detection, no Hough lines, no color-distance sampling.
                Reintroduced from commit 4bc3db5 as a genuinely separate,
                selectable engine (not merged into `canny`).
      `canny`  — the current polarity-independent pipeline (FIX1): gutters
                /borders are found via edge density (a solid-color band has
                almost no edges, regardless of whether it is near-white,
                near-black, or a mid-tone color), reinforced by long
                straight-line detection (Hough) and a color-distance-from-
                background signal. This is the default engine — with no
                advanced params supplied, its output is byte-identical to
                the pre-FIX6 `--mode auto` primary detection.
      `grid`   — skips primary detection entirely and always returns a
                geometric `grid-fallback` grid (FIX3 `--mode grid` renamed).
                Never called "auto": it runs no visual detection at all.

    Both `otsu` and `canny` can still fall back to the same explicit/auto
    grid (FIX3 behavior, unchanged) when `--expected-shots` is a valid
    integer > 1 and the primary result is ambiguous, mismatched, or below
    the confidence threshold. `--custom-threshold` (FIX6, 0.00-1.00), when
    given, replaces the `--sensitivity` preset threshold for this decision;
    `--sensitivity` alone is used otherwise (unchanged FIX3 behavior).

  crop --input <path> --regions <regions.json> --output-dir <dir>
    Crops the exact rectangles given in `regions.json` (already chosen/
    edited by the user server-side) and writes one PNG per region into
    `output-dir` (a caller-supplied scratch directory, never
    public/uploads itself).

Every response is a single JSON object on stdout, always with an "ok" key.
Non-zero exit code on any failure; stderr may carry diagnostic text but the
Node caller must only ever parse stdout.

Dependencies: opencv-python-headless, numpy (see requirements listed in
docs/DEVELOPMENT_WORKFLOW.md for install instructions).
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass, fields

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Default tunables (FIX6: every one of these is also an overridable advanced
# CLI flag — see build_arg_parser()/resolve_params(). The literal values
# below are unchanged from pre-FIX6 behavior, so any caller that supplies no
# advanced flags gets byte-identical output to before this ticket.
# ---------------------------------------------------------------------------
MIN_CELL_FRACTION = 0.02  # a candidate cell must cover at least 2% of the source area
EDGE_GUTTER_DENSITY_THRESHOLD = 0.015  # rows/cols with less content than this read as gutter-like (canny: edge density: otsu: content-mask density)
COLOR_DISTANCE_THRESHOLD = 25  # canny-only: grayscale distance from the border-sampled background estimate to count a pixel as content
MIN_GUTTER_RUN_PX = 14  # a gutter band must be at least this many px wide to count
MIN_GUTTER_RUN_FRACTION = 0.002  # ...or this fraction of the relevant dimension, whichever is larger
GUTTER_MERGE_GAP_PX = 4  # bridges a raw low-density run across a thin explicit border line before the length filter above is applied
HOUGH_LINE_FRACTION = 0.75  # canny-only: a Hough line must span at least this fraction of the relevant dimension to count as a long separator
HOUGH_VOTE_THRESHOLD = 80  # canny-only: HoughLinesP accumulator vote threshold
HOUGH_MAX_LINE_GAP = 10  # canny-only: HoughLinesP maximum gap (px) to join line segments
MAX_HOUGH_LINES = 500  # canny-only: bounded — never process an unbounded number of candidate lines
MAX_HOUGH_LINES_HARD_CAP = 2000  # absolute ceiling regardless of what the caller requests, to bound worst-case CPU/memory
CANNY_SIGMA = 0.33  # canny-only: auto-Canny threshold spread around the image's own median intensity

GRID_FALLBACK_CONFIDENCE = 0.15
MIN_FALLBACK_CELL_FRACTION = 0.01  # a grid-fallback cell must still cover at least 1% of the source area
MIN_FALLBACK_CELL_PX = 8
MAX_GRID_DIMENSION = 12  # reasonable bound for an explicit Columns/Rows override

# FIX3 — Sensitivity profiles map to how strict primary-engine trust is when
# its region count already matches the expected Shot count. FIX6: a
# `--custom-threshold` value takes priority over these presets when given.
SENSITIVITY_THRESHOLDS = {"low": 0.10, "medium": 0.18, "high": 0.30}

CAPTION_UNIFORMITY_THRESHOLD = 0.85  # fraction of near-white OR near-black pixels in a row to call it a caption background band
CAPTION_MIN_RUN_PX = 12
CAPTION_MIN_ILLUSTRATION_FRACTION = 0.3  # discard a split that would leave less than this fraction of the cell as illustration — unreliable

ENGINES = ("otsu", "canny", "grid")

# REVISE (Codex finding #1) — the ORIGINAL SEQGEN.STORYBOARD.EXTRACT.1 (commit
# 4bc3db5) gutter-detection constants, distinct from the FIX1/FIX6-tuned
# defaults above. `otsu` must default to THESE values (its own legacy
# semantics), never silently inherit the canny-tuned shared defaults —
# otherwise "Otsu (Legacy)" cannot reproduce the historical detector on a
# light-background fixture, defeating the point of offering it. The original
# script also never merged raw low-density runs at all (no merge-gap
# concept) — modeled here as merge_gap=0, which is a real no-op given real
# density data (see merge_close_runs: two genuinely separate low-density
# runs are always separated by at least one non-gutter sample, i.e. gap>=1).
OTSU_LEGACY_GUTTER_DENSITY_THRESHOLD = 0.02
OTSU_LEGACY_MIN_GUTTER_RUN_PX = 4
OTSU_LEGACY_MIN_GUTTER_RUN_FRACTION = 0.004
OTSU_LEGACY_GUTTER_MERGE_GAP_PX = 0


@dataclass
class AdvancedParams:
    """Every FIX6 advanced tunable, resolved to a concrete value (CLI
    override or the pre-FIX6 default constant above). Passed explicitly
    through the detection pipeline instead of relying on module globals, so
    each `detect` invocation is self-contained and reproducible."""

    min_cell_area_fraction: float = MIN_CELL_FRACTION
    gutter_density_threshold: float = EDGE_GUTTER_DENSITY_THRESHOLD
    color_distance_threshold: float = COLOR_DISTANCE_THRESHOLD
    min_gutter_width_px: int = MIN_GUTTER_RUN_PX
    min_gutter_fraction: float = MIN_GUTTER_RUN_FRACTION
    gutter_merge_gap_px: int = GUTTER_MERGE_GAP_PX
    canny_sigma: float = CANNY_SIGMA
    hough_min_line_fraction: float = HOUGH_LINE_FRACTION
    hough_vote_threshold: int = HOUGH_VOTE_THRESHOLD
    hough_max_line_gap: int = HOUGH_MAX_LINE_GAP
    max_hough_lines: int = MAX_HOUGH_LINES
    caption_uniformity_threshold: float = CAPTION_UNIFORMITY_THRESHOLD
    caption_min_run_px: int = CAPTION_MIN_RUN_PX
    min_illustration_fraction: float = CAPTION_MIN_ILLUSTRATION_FRACTION


# (param name, min, max) — enforced both here (defense in depth) and, primarily,
# server-side in src/actions/storyboardExtraction.ts before the worker is spawned.
PARAM_BOUNDS = {
    "min_cell_area_fraction": (0.0, 1.0),
    "gutter_density_threshold": (0.0, 1.0),
    "color_distance_threshold": (0, 255),
    "min_gutter_width_px": (0, 2000),
    "min_gutter_fraction": (0.0, 1.0),
    "gutter_merge_gap_px": (0, 500),
    "canny_sigma": (0.0, 2.0),
    "hough_min_line_fraction": (0.0, 1.0),
    "hough_vote_threshold": (1, 5000),
    "hough_max_line_gap": (0, 2000),
    "max_hough_lines": (1, MAX_HOUGH_LINES_HARD_CAP),
    "caption_uniformity_threshold": (0.0, 1.0),
    "caption_min_run_px": (0, 2000),
    "min_illustration_fraction": (0.0, 1.0),
}


def eprint(*args):
    print(*args, file=sys.stderr)


def fail(message: str):
    print(json.dumps({"ok": False, "error": message}))
    sys.exit(1)


def default_params_for_engine(engine: str) -> AdvancedParams:
    """REVISE (Codex finding #1) — the starting point `resolve_params` layers
    explicit CLI overrides on top of. `otsu` gets its own legacy gutter-
    detection defaults (see OTSU_LEGACY_* above); `canny`/`grid` keep the
    existing FIX1/FIX6-tuned defaults untouched (byte-identical pre-FIX6
    behavior for callers that pass no advanced params)."""
    if engine == "otsu":
        return AdvancedParams(
            gutter_density_threshold=OTSU_LEGACY_GUTTER_DENSITY_THRESHOLD,
            min_gutter_width_px=OTSU_LEGACY_MIN_GUTTER_RUN_PX,
            min_gutter_fraction=OTSU_LEGACY_MIN_GUTTER_RUN_FRACTION,
            gutter_merge_gap_px=OTSU_LEGACY_GUTTER_MERGE_GAP_PX,
        )
    return AdvancedParams()


def resolve_params(args, engine: str = "canny") -> AdvancedParams:
    params = default_params_for_engine(engine)
    for f in fields(AdvancedParams):
        cli_value = getattr(args, f.name, None)
        if cli_value is None:
            continue
        lo, hi = PARAM_BOUNDS[f.name]
        if not (lo <= cli_value <= hi):
            fail(f"--{f.name.replace('_', '-')} must be between {lo} and {hi} (got {cli_value}).")
        setattr(params, f.name, cli_value)
    return params


# ---------------------------------------------------------------------------
# Shared helpers (used by both the `otsu` and `canny` engines, and by the
# `grid` fallback) — the JSON output contract is built exclusively through
# these, so adding a new primary engine never duplicates it.
# ---------------------------------------------------------------------------

def auto_canny(gray: np.ndarray, sigma: float) -> np.ndarray:
    """Polarity-independent edge map: thresholds derived from the image's
    own median intensity, so it works the same whether separators/captions
    are near-white or near-black. canny engine only."""
    v = float(np.median(gray))
    lower = int(max(0, (1.0 - sigma) * v))
    upper = int(min(255, (1.0 + sigma) * v))
    return cv2.Canny(gray, lower, upper)


def reinforce_with_hough_lines(edges: np.ndarray, width: int, height: int, params: AdvancedParams):
    """Returns (row_is_line, col_is_line) boolean masks marking rows/cols a
    long, mostly-straight Hough line crosses. canny engine only."""
    row_is_line = np.zeros(height, dtype=bool)
    col_is_line = np.zeros(width, dtype=bool)

    min_len_h = int(width * params.hough_min_line_fraction)
    min_len_v = int(height * params.hough_min_line_fraction)
    min_len = max(1, min(min_len_h, min_len_v))
    max_lines = min(params.max_hough_lines, MAX_HOUGH_LINES_HARD_CAP)

    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180,
        threshold=params.hough_vote_threshold,
        minLineLength=min_len,
        maxLineGap=params.hough_max_line_gap,
    )
    if lines is None:
        return row_is_line, col_is_line

    for line in lines[:max_lines]:
        x1, y1, x2, y2 = np.asarray(line).reshape(-1)[:4]
        dx, dy = int(x2) - int(x1), int(y2) - int(y1)
        length = (dx * dx + dy * dy) ** 0.5
        if length < 1:
            continue
        angle = abs(np.degrees(np.arctan2(dy, dx)))
        if (angle < 5 or angle > 175) and length >= min_len_h:
            y = int(round((y1 + y2) / 2))
            if 0 <= y < height:
                row_is_line[y] = True
        elif 85 < angle < 95 and length >= min_len_v:
            x = int(round((x1 + x2) / 2))
            if 0 <= x < width:
                col_is_line[x] = True

    return row_is_line, col_is_line


def find_raw_low_density_runs(density: np.ndarray, threshold: float) -> list[tuple[int, int]]:
    runs = []
    start = None
    for i, v in enumerate(density):
        is_low = v < threshold
        if is_low and start is None:
            start = i
        elif not is_low and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(density)))
    return runs


def merge_close_runs(runs: list[tuple[int, int]], max_gap: int) -> list[tuple[int, int]]:
    if not runs:
        return []
    merged = [runs[0]]
    for start, end in runs[1:]:
        last_start, last_end = merged[-1]
        if start - last_end <= max_gap:
            merged[-1] = (last_start, end)
        else:
            merged.append((start, end))
    return merged


def find_gutter_runs(density: np.ndarray, min_run: int, threshold: float, merge_gap: int) -> list[tuple[int, int]]:
    """Returns [(start, end)] index ranges that read as a real gutter: low
    density for at least `min_run` consecutive samples, after first bridging
    raw low-density runs separated by no more than `merge_gap` samples."""
    raw_runs = find_raw_low_density_runs(density, threshold)
    merged_runs = merge_close_runs(raw_runs, merge_gap)
    return [(s, e) for (s, e) in merged_runs if e - s >= min_run]


def bands_from_gutters(gutters: list[tuple[int, int]], total: int) -> list[tuple[int, int]]:
    bands = []
    cursor = 0
    for (g_start, g_end) in gutters:
        if g_start > cursor:
            bands.append((cursor, g_start))
        cursor = g_end
    if cursor < total:
        bands.append((cursor, total))
    return [b for b in bands if b[1] > b[0]]


def detect_illustration_split(cell_gray: np.ndarray, params: AdvancedParams) -> tuple[int | None, bool]:
    """Best-effort illustration/caption split within one cell, scanning the
    lower half for a sustained near-uniform band — either near-white or
    near-black. Shared by every engine: it is not a primary-detection
    signal, so it does not need to differ between them."""
    h, w = cell_gray.shape
    search_start = h // 2
    lower = cell_gray[search_start:h, :]
    frac_white = np.mean(lower > 240, axis=1)
    frac_black = np.mean(lower < 15, axis=1)
    uniformity = np.maximum(frac_white, frac_black)

    run_start = None
    for i, v in enumerate(uniformity):
        if v > params.caption_uniformity_threshold:
            if run_start is None:
                run_start = i
            if i - run_start + 1 >= params.caption_min_run_px:
                boundary = search_start + run_start
                if boundary < h * params.min_illustration_fraction:
                    return None, False
                return boundary, True
        else:
            run_start = None
    return None, False


def build_region(x0: int, y0: int, x1: int, y1: int, gray: np.ndarray, confidence: float, detection_mode: str, params: AdvancedParams) -> dict:
    cell_gray = gray[y0:y1, x0:x1]
    illustration_height, text_detected = detect_illustration_split(cell_gray, params)
    return {
        "x": int(x0),
        "y": int(y0),
        "width": int(x1 - x0),
        "height": int(y1 - y0),
        "confidence": confidence,
        "detectionMode": detection_mode,
        "illustrationHeight": int(illustration_height) if illustration_height is not None else None,
        "textSeparationDetected": bool(text_detected),
    }


def compute_confidence(candidate_count: int, row_bands, col_bands, row_gutters, col_gutters, width: int, height: int) -> float:
    """Grid-regularity + gutter-strength heuristic, shared by every primary
    engine so their confidence scores are directly comparable."""
    if candidate_count == 0:
        return 0.0
    grid_rows = len(row_bands)
    grid_cols = len(col_bands)
    expected_cells = grid_rows * grid_cols
    grid_regularity = min(1.0, candidate_count / expected_cells) if expected_cells > 0 else 0.5
    avg_cell_w = width / max(grid_cols, 1)
    avg_cell_h = height / max(grid_rows, 1)
    avg_gutter_w = (sum(e - s for s, e in col_gutters) / len(col_gutters)) if col_gutters else 0
    avg_gutter_h = (sum(e - s for s, e in row_gutters) / len(row_gutters)) if row_gutters else 0
    gutter_strength = min(1.0, ((avg_gutter_w / max(avg_cell_w, 1)) + (avg_gutter_h / max(avg_cell_h, 1))))
    return round(max(0.05, min(0.99, 0.5 * grid_regularity + 0.5 * gutter_strength)), 3)


def candidates_from_bands(row_bands, col_bands, content: np.ndarray, width: int, height: int, params: AdvancedParams):
    candidates = []
    if not row_bands or not col_bands:
        return candidates
    min_area = width * height * params.min_cell_area_fraction
    for (y0, y1) in row_bands:
        for (x0, x1) in col_bands:
            cell_w = x1 - x0
            cell_h = y1 - y0
            if cell_w * cell_h < min_area:
                continue
            cell_content = content[y0:y1, x0:x1]
            if np.mean(cell_content) < 0.01:
                continue  # essentially blank — a stray gutter sliver, not real content
            candidates.append((y0, x0, y1, x1))
    return candidates


def gutter_bands(density_rows: np.ndarray, density_cols: np.ndarray, width: int, height: int, params: AdvancedParams):
    min_gutter_run_rows = max(params.min_gutter_width_px, int(height * params.min_gutter_fraction))
    min_gutter_run_cols = max(params.min_gutter_width_px, int(width * params.min_gutter_fraction))
    row_gutters = find_gutter_runs(density_rows, min_gutter_run_rows, params.gutter_density_threshold, params.gutter_merge_gap_px)
    col_gutters = find_gutter_runs(density_cols, min_gutter_run_cols, params.gutter_density_threshold, params.gutter_merge_gap_px)
    row_bands = bands_from_gutters(row_gutters, height)
    col_bands = bands_from_gutters(col_gutters, width)
    return row_gutters, col_gutters, row_bands, col_bands


# ---------------------------------------------------------------------------
# Primary engines — genuinely distinct detection algorithms, sharing only
# the helpers above (never each other's core logic).
# ---------------------------------------------------------------------------

def detect_regions_canny(gray: np.ndarray, width: int, height: int, params: AdvancedParams):
    """FIX1 polarity-independent pipeline: edge density (Canny) reinforced
    by long straight-line detection (Hough) and a color-distance-from-
    sampled-background signal. Works the same whether separators/captions
    are near-white, near-black, or any other uniform color."""
    edges = auto_canny(gray, params.canny_sigma)
    row_is_line, col_is_line = reinforce_with_hough_lines(edges, width, height, params)

    border_px = np.concatenate([
        gray[:3, :].ravel(), gray[-3:, :].ravel(),
        gray[:, :3].ravel(), gray[:, -3:].ravel(),
    ])
    background_estimate = float(np.median(border_px))
    color_content = np.abs(gray.astype(np.int16) - background_estimate) > params.color_distance_threshold

    content = (edges > 0) | color_content
    row_density = np.mean(content, axis=1)
    col_density = np.mean(content, axis=0)
    row_density = np.where(row_is_line, 0.0, row_density)
    col_density = np.where(col_is_line, 0.0, col_density)

    row_gutters, col_gutters, row_bands, col_bands = gutter_bands(row_density, col_density, width, height, params)
    candidates = candidates_from_bands(row_bands, col_bands, content, width, height, params)
    confidence = compute_confidence(len(candidates), row_bands, col_bands, row_gutters, col_gutters, width, height)
    return candidates, confidence


def detect_regions_otsu(gray: np.ndarray, width: int, height: int, params: AdvancedParams):
    """Original SEQGEN.STORYBOARD.EXTRACT.1 pipeline (commit 4bc3db5),
    reintroduced as a separate, selectable engine (FIX6). A single global
    Otsu threshold splits background from content — no edge detection, no
    Hough lines, no color-distance sampling. Handles varying exposure via
    Otsu's own automatic threshold choice, but (unlike `canny`) assumes the
    background is genuinely near-uniform brightness across the whole image,
    not just locally — this is the actual behavioral difference between the
    two engines, not merely an implementation detail."""
    _, content_mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    content = content_mask > 0

    row_density = np.mean(content, axis=1)
    col_density = np.mean(content, axis=0)

    row_gutters, col_gutters, row_bands, col_bands = gutter_bands(row_density, col_density, width, height, params)
    candidates = candidates_from_bands(row_bands, col_bands, content, width, height, params)
    confidence = compute_confidence(len(candidates), row_bands, col_bands, row_gutters, col_gutters, width, height)
    return candidates, confidence


# ---------------------------------------------------------------------------
# Grid fallback (FIX3, unchanged) — shared by every engine's fallback path
# and by the explicit `grid` engine itself.
# ---------------------------------------------------------------------------

def best_fit_factorization(count: int, image_aspect: float) -> tuple[int, int] | None:
    best = None
    best_diff = None
    for rows in range(1, count + 1):
        if count % rows != 0:
            continue
        cols = count // rows
        diff = abs((cols / rows) - image_aspect)
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best = (rows, cols)
    return best


def try_grid_fallback(
    width: int,
    height: int,
    expected_shot_count,
    columns: int | None = None,
    rows_override: int | None = None,
) -> list[tuple[int, int, int, int]] | None:
    explicit = columns is not None or rows_override is not None

    if explicit:
        if columns is None or rows_override is None:
            fail("Provide both Columns and Rows, or neither.")
        if not (1 <= columns <= MAX_GRID_DIMENSION and 1 <= rows_override <= MAX_GRID_DIMENSION):
            fail(f"Columns and Rows must each be between 1 and {MAX_GRID_DIMENSION}.")
        if isinstance(expected_shot_count, int) and expected_shot_count > 0:
            if columns * rows_override != expected_shot_count:
                fail(
                    f"Columns x Rows ({columns}x{rows_override}={columns * rows_override}) "
                    f"does not match the expected Shot count ({expected_shot_count})."
                )
        rows, cols = rows_override, columns
    else:
        if not isinstance(expected_shot_count, int) or expected_shot_count <= 1:
            return None
        image_aspect = width / height
        best = best_fit_factorization(expected_shot_count, image_aspect)
        if best is None:
            return None
        rows, cols = best

    cell_w = width / cols
    cell_h = height / rows
    geometrically_valid = (
        cell_w >= MIN_FALLBACK_CELL_PX
        and cell_h >= MIN_FALLBACK_CELL_PX
        and cell_w * cell_h >= width * height * MIN_FALLBACK_CELL_FRACTION
    )
    if not geometrically_valid:
        if explicit:
            fail(f"A {cols}x{rows} grid would produce cells too small for this image.")
        return None

    cells = []
    for r in range(rows):
        for c in range(cols):
            x0 = int(round(c * cell_w))
            x1 = int(round((c + 1) * cell_w)) if c < cols - 1 else width
            y0 = int(round(r * cell_h))
            y1 = int(round((r + 1) * cell_h)) if r < rows - 1 else height
            cells.append((x0, y0, x1, y1))
    return cells


def build_fallback_regions(fallback: list[tuple[int, int, int, int]], gray: np.ndarray, max_cells: int, params: AdvancedParams) -> list[dict]:
    fallback = sorted(fallback, key=lambda c: (c[1], c[0]))  # reading order: (y0, x0)
    regions = [
        build_region(x0, y0, x1, y1, gray, GRID_FALLBACK_CONFIDENCE, "grid-fallback", params)
        for (x0, y0, x1, y1) in fallback
    ]
    return regions[:max_cells]


def decide_fallback(candidate_count: int, confidence: float, expected_shot_count, threshold: float) -> tuple[bool, str | None]:
    """FIX3 fallback trigger, unchanged, now also returning the exact
    human-readable reason (FIX6 diagnostics.fallbackReason)."""
    if not (isinstance(expected_shot_count, int) and expected_shot_count > 1):
        return False, None
    if candidate_count <= 1:
        return True, "primary detection found 0 or 1 region (ambiguous)"
    if candidate_count != expected_shot_count:
        return True, f"primary detected {candidate_count} region(s), expected {expected_shot_count}"
    if confidence < threshold:
        return True, f"primary confidence {confidence} is below threshold {threshold}"
    return False, None


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

def detect_regions(
    input_path: str,
    max_cells: int,
    expected_shot_count,
    engine: str = "canny",
    columns: int | None = None,
    rows: int | None = None,
    sensitivity: str = "medium",
    custom_threshold: float | None = None,
    params: AdvancedParams | None = None,
) -> dict:
    if params is None:
        params = AdvancedParams()

    img = cv2.imread(input_path)
    if img is None:
        fail(f"Could not read image: {input_path}")

    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if engine == "grid":
        # FIX3/FIX6 — the explicit Grid engine never runs Otsu or Canny.
        fallback = try_grid_fallback(width, height, expected_shot_count, columns, rows)
        if fallback is None:
            fail("Could not build a grid: provide Columns and Rows, or a valid expected Shot count.")
        regions = build_fallback_regions(fallback, gray, max_cells, params)
        diagnostics = {
            "primaryEngine": "grid",
            "detectedCount": len(regions),
            "confidence": GRID_FALLBACK_CONFIDENCE,
            "threshold": None,
            "fallbackTriggered": False,
            "fallbackReason": None,
            "finalEngine": "grid",
        }
        return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions, "diagnostics": diagnostics}

    if engine == "otsu":
        candidates, confidence = detect_regions_otsu(gray, width, height, params)
    elif engine == "canny":
        candidates, confidence = detect_regions_canny(gray, width, height, params)
    else:
        fail(f"Unknown engine: {engine}")
        return {}  # unreachable, satisfies type checkers

    candidates.sort(key=lambda c: (c[0], c[1]))
    candidates = candidates[:max_cells]

    threshold_used = custom_threshold if custom_threshold is not None else SENSITIVITY_THRESHOLDS.get(sensitivity, SENSITIVITY_THRESHOLDS["medium"])
    should_try_fallback, fallback_reason = decide_fallback(len(candidates), confidence, expected_shot_count, threshold_used)

    if should_try_fallback:
        fallback = try_grid_fallback(width, height, expected_shot_count, columns, rows)
        if fallback is not None:
            regions = build_fallback_regions(fallback, gray, max_cells, params)
            diagnostics = {
                "primaryEngine": engine,
                "detectedCount": len(candidates),
                "confidence": confidence,
                "threshold": threshold_used,
                "fallbackTriggered": True,
                "fallbackReason": fallback_reason,
                "finalEngine": "grid-fallback",
            }
            return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions, "diagnostics": diagnostics}
        # Auto-computed fallback unavailable (geometrically impossible) —
        # fall through and return whatever primary detection actually found,
        # even if that's an empty or mismatched-count result: never invent
        # a grid that wasn't explicitly requested and can't be built safely.
        fallback_reason = f"{fallback_reason} — grid fallback unavailable (geometrically impossible), kept primary result"

    diagnostics = {
        "primaryEngine": engine,
        "detectedCount": len(candidates),
        "confidence": confidence,
        "threshold": threshold_used,
        "fallbackTriggered": False,
        "fallbackReason": fallback_reason if should_try_fallback else None,
        "finalEngine": engine,
    }

    if not candidates:
        return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": [], "diagnostics": diagnostics}

    # detectionMode is a structural field the Node caller's DB enum
    # constrains to "border"/"manual"/"grid-fallback" — which primary
    # ENGINE produced a "border" region is reported separately via
    # diagnostics.primaryEngine, never conflated with this field.
    regions = [build_region(x0, y0, x1, y1, gray, confidence, "border", params) for (y0, x0, y1, x1) in candidates]
    return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions, "diagnostics": diagnostics}


def cmd_detect(args):
    if not os.path.isfile(args.input):
        fail(f"Input file not found: {args.input}")
    expected_shot_count = args.expected_shots if (args.expected_shots is not None and args.expected_shots > 0) else None
    columns = args.columns if (args.columns is not None and args.columns > 0) else None
    rows = args.rows if (args.rows is not None and args.rows > 0) else None
    if args.custom_threshold is not None and not (0.0 <= args.custom_threshold <= 1.0):
        fail(f"--custom-threshold must be between 0.00 and 1.00 (got {args.custom_threshold}).")
    params = resolve_params(args, engine=args.engine)
    result = detect_regions(
        args.input,
        args.max_cells,
        expected_shot_count,
        engine=args.engine,
        columns=columns,
        rows=rows,
        sensitivity=args.sensitivity,
        custom_threshold=args.custom_threshold,
        params=params,
    )
    print(json.dumps(result))


def cmd_crop(args):
    if not os.path.isfile(args.input):
        fail(f"Input file not found: {args.input}")
    if not os.path.isfile(args.regions):
        fail(f"Regions file not found: {args.regions}")

    try:
        with open(args.regions, "r", encoding="utf-8") as f:
            regions = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        fail(f"Could not read regions JSON: {e}")

    if not isinstance(regions, list):
        fail("Regions JSON must be an array.")

    img = cv2.imread(args.input)
    if img is None:
        fail(f"Could not read image: {args.input}")
    height, width = img.shape[:2]

    os.makedirs(args.output_dir, exist_ok=True)

    files = []
    for region in regions:
        if not isinstance(region, dict):
            fail("Each region must be an object.")
        try:
            index = int(region["index"])
            x = int(region["x"])
            y = int(region["y"])
            w = int(region["width"])
            h = int(region["height"])
        except (KeyError, ValueError, TypeError):
            fail(f"Invalid region entry: {region}")

        if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > width or y + h > height:
            fail(f"Region {index} out of source image bounds ({width}x{height}): {region}")

        crop = img[y : y + h, x : x + w]
        filename = f"region-{index}.png"
        out_path = os.path.join(args.output_dir, filename)
        ok = cv2.imwrite(out_path, crop)
        if not ok:
            fail(f"Failed to write crop for region {index}.")
        files.append({"index": index, "filename": filename})

    print(json.dumps({"ok": True, "files": files}))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenCV Sequence Storyboard panel detector/extractor.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_detect = sub.add_parser("detect")
    p_detect.add_argument("--input", required=True)
    p_detect.add_argument("--max-cells", type=int, default=24)
    p_detect.add_argument("--expected-shots", type=int, default=None)
    p_detect.add_argument("--engine", choices=list(ENGINES), default="canny")
    p_detect.add_argument("--columns", type=int, default=None)
    p_detect.add_argument("--rows", type=int, default=None)
    p_detect.add_argument("--sensitivity", choices=["low", "medium", "high"], default="medium")
    p_detect.add_argument("--custom-threshold", type=float, default=None)

    # FIX6 — advanced tunables, one CLI flag per AdvancedParams field. All
    # optional: omitting a flag keeps the pre-FIX6 default constant.
    p_detect.add_argument("--min-cell-area-fraction", dest="min_cell_area_fraction", type=float, default=None)
    p_detect.add_argument("--gutter-density-threshold", dest="gutter_density_threshold", type=float, default=None)
    p_detect.add_argument("--color-distance-threshold", dest="color_distance_threshold", type=float, default=None)
    p_detect.add_argument("--min-gutter-width-px", dest="min_gutter_width_px", type=int, default=None)
    p_detect.add_argument("--min-gutter-fraction", dest="min_gutter_fraction", type=float, default=None)
    p_detect.add_argument("--gutter-merge-gap-px", dest="gutter_merge_gap_px", type=int, default=None)
    p_detect.add_argument("--canny-sigma", dest="canny_sigma", type=float, default=None)
    p_detect.add_argument("--hough-min-line-fraction", dest="hough_min_line_fraction", type=float, default=None)
    p_detect.add_argument("--hough-vote-threshold", dest="hough_vote_threshold", type=int, default=None)
    p_detect.add_argument("--hough-max-line-gap", dest="hough_max_line_gap", type=int, default=None)
    p_detect.add_argument("--max-hough-lines", dest="max_hough_lines", type=int, default=None)
    p_detect.add_argument("--caption-uniformity-threshold", dest="caption_uniformity_threshold", type=float, default=None)
    p_detect.add_argument("--caption-min-run-px", dest="caption_min_run_px", type=int, default=None)
    p_detect.add_argument("--min-illustration-fraction", dest="min_illustration_fraction", type=float, default=None)
    p_detect.set_defaults(func=cmd_detect)

    p_crop = sub.add_parser("crop")
    p_crop.add_argument("--input", required=True)
    p_crop.add_argument("--regions", required=True)
    p_crop.add_argument("--output-dir", required=True)
    p_crop.set_defaults(func=cmd_crop)

    return parser


def main():
    parser = build_arg_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as e:  # noqa: BLE001 — must always emit the JSON contract, never a raw traceback
        fail(f"Unexpected error: {e}")


if __name__ == "__main__":
    main()
