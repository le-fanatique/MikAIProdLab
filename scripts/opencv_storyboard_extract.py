#!/usr/bin/env python3
"""
opencv_storyboard_extract.py — SEQGEN.STORYBOARD.EXTRACT.1 / -FIX1 / -FIX3

Detects bordered/gutter-separated panels ("cells") in a Sequence Storyboard
contact-sheet image, and crops confirmed regions on request. Talks to the
Node server exclusively via a strict JSON contract on stdout — never writes
to public/uploads directly (the server action owns validating and copying
any output file into permanent storage).

Two subcommands:

  detect --input <path> [--max-cells N] [--expected-shots N] [--mode auto|grid]
         [--columns N] [--rows N] [--sensitivity low|medium|high]
    Analyzes the image and prints a JSON object describing candidate
    regions, in reading order (top-to-bottom, left-to-right), each with a
    confidence score and a best-effort illustration/caption split.

    Separator detection is polarity-independent (FIX1): gutters/borders are
    found via edge density (a solid-color band has almost no edges,
    regardless of whether it is near-white, near-black, or a mid-tone
    color), reinforced by long straight-line detection (Hough) for thin
    explicit border lines a pure density scan could miss.

    `--mode grid` (FIX3) skips primary detection entirely and always returns
    a `grid-fallback` grid — sized by `--columns`/`--rows` if both are given
    (their product must match `--expected-shots` when that is also
    provided, or the request fails with a visible error), otherwise sized
    to `--expected-shots` via the aspect-ratio-matching factorization below.

    `--mode auto` (default) runs primary detection first, then falls back
    to the same `grid-fallback` grid — always at low confidence, never
    silently — when `--expected-shots` is a valid integer > 1 and any of:
    the primary result is ambiguous (0 or 1 region), its region count does
    not match `--expected-shots`, or its confidence is below the
    `--sensitivity` profile's threshold (FIX3: Low/Medium/High map to
    increasingly strict confidence gates — see SENSITIVITY_THRESHOLDS).
    `--columns`/`--rows`, if given, override the auto-chosen factorization
    for this fallback grid too. A fallback is never forced when the
    resulting cells would be geometrically unreasonable (fewer than 8px per
    side, or under 1% of the source area) — an explicit `--columns`/`--rows`
    request that fails this check is a visible error; an auto-computed one
    silently keeps the primary (possibly empty/mismatched) result instead.

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

import cv2
import numpy as np

MIN_CELL_FRACTION = 0.02  # a candidate cell must cover at least 2% of the source area
EDGE_GUTTER_DENSITY_THRESHOLD = 0.015  # rows/cols with <1.5% content pixels read as gutter-like, whatever their color
COLOR_DISTANCE_THRESHOLD = 25  # grayscale distance from the border-sampled background estimate to count a pixel as content
MIN_GUTTER_RUN_PX = 14  # a gutter band must be at least this many px wide to count — empirically tuned to sit above in-cell padding gaps (e.g. an ~11px gap between a photo and its own caption) and below real inter-cell gutters (as narrow as ~21px in tested real fixtures)
MIN_GUTTER_RUN_FRACTION = 0.002  # ...or this fraction of the relevant dimension, whichever is larger — a floor for very large images, negligible at the resolutions tested
GUTTER_MERGE_GAP_PX = 4  # bridges a raw low-density run across a thin explicit border line before the length filter above is applied
HOUGH_LINE_FRACTION = 0.75  # a Hough line must span at least 75% of the relevant dimension to count as a long separator
MAX_HOUGH_LINES = 500  # bounded — never process an unbounded number of candidate lines

GRID_FALLBACK_CONFIDENCE = 0.15
MIN_FALLBACK_CELL_FRACTION = 0.01  # a grid-fallback cell must still cover at least 1% of the source area
MIN_FALLBACK_CELL_PX = 8
MAX_GRID_DIMENSION = 12  # reasonable bound for an explicit Columns/Rows override

# FIX3 — Sensitivity profiles map to how strict Auto mode is about trusting a
# primary detection result whose region count already matches the expected
# Shot count: the LOWER the threshold, the more a low-but-matching-count
# confidence is still trusted (fewer fallback proposals); the HIGHER the
# threshold, the more readily Auto proposes the grid instead. Chosen so the
# already-validated real fixtures (confidence ~0.22-0.25, correct counts)
# keep their primary result at Low/Medium and only flip to grid-fallback at
# High — giving a genuinely observable difference between levels rather than
# arbitrary numbers.
SENSITIVITY_THRESHOLDS = {"low": 0.10, "medium": 0.18, "high": 0.30}

CAPTION_UNIFORMITY_THRESHOLD = 0.85  # fraction of near-white OR near-black pixels in a row to call it a caption background band
CAPTION_MIN_RUN_PX = 12
CAPTION_MIN_ILLUSTRATION_FRACTION = 0.3  # discard a split that would leave less than 30% of the cell as illustration — unreliable


def eprint(*args):
    print(*args, file=sys.stderr)


def fail(message: str):
    print(json.dumps({"ok": False, "error": message}))
    sys.exit(1)


def auto_canny(gray: np.ndarray, sigma: float = 0.33) -> np.ndarray:
    """Polarity-independent edge map: thresholds derived from the image's
    own median intensity, so it works the same whether separators/captions
    are near-white or near-black."""
    v = float(np.median(gray))
    lower = int(max(0, (1.0 - sigma) * v))
    upper = int(min(255, (1.0 + sigma) * v))
    return cv2.Canny(gray, lower, upper)


def reinforce_with_hough_lines(edges: np.ndarray, width: int, height: int):
    """Returns (row_is_line, col_is_line) boolean masks marking rows/cols a
    long, mostly-straight Hough line crosses — reinforces thin explicit
    separator lines a pure edge-density scan could miss. Deterministic and
    bounded: fixed Hough parameters, capped candidate-line count."""
    row_is_line = np.zeros(height, dtype=bool)
    col_is_line = np.zeros(width, dtype=bool)

    min_len_h = int(width * HOUGH_LINE_FRACTION)
    min_len_v = int(height * HOUGH_LINE_FRACTION)
    min_len = max(1, min(min_len_h, min_len_v))

    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=min_len, maxLineGap=10)
    if lines is None:
        return row_is_line, col_is_line

    for line in lines[:MAX_HOUGH_LINES]:
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
    """Returns every [(start, end)] index range where `density` stays below
    `threshold`, with no minimum length — the unfiltered signal before
    merging/length filtering."""
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
    """Bridges raw low-density runs separated by a content gap of at most
    `max_gap` samples — a thin explicit border line (a couple of high-
    density pixels) inside an otherwise-uniform gutter should not fragment
    that gutter into several too-short pieces that then fail the minimum
    run length below."""
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


def find_gutter_runs(density: np.ndarray, min_run: int, threshold: float, merge_gap: int = 4) -> list[tuple[int, int]]:
    """Returns [(start, end)] index ranges that read as a real gutter: low
    density for at least `min_run` consecutive samples, after first bridging
    raw low-density runs separated by no more than `merge_gap` samples (see
    `merge_close_runs`) — this distinguishes a real, if narrow, inter-cell
    gutter (several short low-density runs broken up only by a thin border
    line) from a merely brief low-content dip inside a cell (e.g. the
    padding between a photo and its own caption), which never accumulates
    into a long enough run once merged with its true, larger neighbors."""
    raw_runs = find_raw_low_density_runs(density, threshold)
    merged_runs = merge_close_runs(raw_runs, merge_gap)
    return [(s, e) for (s, e) in merged_runs if e - s >= min_run]


def bands_from_gutters(gutters: list[tuple[int, int]], total: int) -> list[tuple[int, int]]:
    """Turns a list of gutter (start,end) ranges into the content bands between them."""
    bands = []
    cursor = 0
    for (g_start, g_end) in gutters:
        if g_start > cursor:
            bands.append((cursor, g_start))
        cursor = g_end
    if cursor < total:
        bands.append((cursor, total))
    return [b for b in bands if b[1] > b[0]]


def detect_illustration_split(cell_gray: np.ndarray) -> tuple[int | None, bool]:
    """Best-effort illustration/caption split within one cell, scanning the
    lower half for a sustained near-uniform band — either near-white
    (light caption background) or near-black (dark caption background),
    since captions may use either polarity. Discards the split if it would
    leave less than CAPTION_MIN_ILLUSTRATION_FRACTION of the cell as
    illustration (too small to be a reliable caption boundary, more likely
    a false positive inside the photo itself)."""
    h, w = cell_gray.shape
    search_start = h // 2
    lower = cell_gray[search_start:h, :]
    frac_white = np.mean(lower > 240, axis=1)
    frac_black = np.mean(lower < 15, axis=1)
    uniformity = np.maximum(frac_white, frac_black)

    run_start = None
    for i, v in enumerate(uniformity):
        if v > CAPTION_UNIFORMITY_THRESHOLD:
            if run_start is None:
                run_start = i
            if i - run_start + 1 >= CAPTION_MIN_RUN_PX:
                boundary = search_start + run_start
                if boundary < h * CAPTION_MIN_ILLUSTRATION_FRACTION:
                    return None, False
                return boundary, True
        else:
            run_start = None
    return None, False


def build_region(x0: int, y0: int, x1: int, y1: int, gray: np.ndarray, confidence: float, detection_mode: str) -> dict:
    cell_gray = gray[y0:y1, x0:x1]
    illustration_height, text_detected = detect_illustration_split(cell_gray)
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


def best_fit_factorization(count: int, image_aspect: float) -> tuple[int, int] | None:
    """Chooses the (rows, cols) factor pair of `count` whose aspect ratio
    (cols/rows) best matches `image_aspect`. Returns None if `count` has no
    valid factor pairs (never true for count >= 1, kept defensive)."""
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
    """Proposes an equal-cell grid. With explicit `columns`/`rows_override`
    (FIX3), uses that exact shape — validated against `expected_shot_count`
    when known, and against geometric limits — failing loudly (`fail()`,
    visible error) on any mismatch, since the user asked for this shape
    specifically. Without them, auto-chooses the row/column factorization of
    `expected_shot_count` whose aspect ratio best matches the source image,
    and silently returns None (never forces a grid) when the count is
    missing/invalid, <=1 (a single Shot never gets a multi-cell fallback),
    or the resulting cells would be geometrically unreasonable — an
    unforced, non-fatal "fallback unavailable" signal to the caller."""
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


def build_fallback_regions(fallback: list[tuple[int, int, int, int]], gray: np.ndarray, max_cells: int) -> list[dict]:
    fallback = sorted(fallback, key=lambda c: (c[1], c[0]))  # reading order: (y0, x0)
    regions = [
        build_region(x0, y0, x1, y1, gray, GRID_FALLBACK_CONFIDENCE, "grid-fallback")
        for (x0, y0, x1, y1) in fallback
    ]
    return regions[:max_cells]


def detect_regions(
    input_path: str,
    max_cells: int,
    expected_shot_count,
    mode: str = "auto",
    columns: int | None = None,
    rows: int | None = None,
    sensitivity: str = "medium",
) -> dict:
    img = cv2.imread(input_path)
    if img is None:
        fail(f"Could not read image: {input_path}")

    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if mode == "grid":
        # FIX3 — explicit Grid mode never runs primary detection at all.
        fallback = try_grid_fallback(width, height, expected_shot_count, columns, rows)
        if fallback is None:
            fail("Could not build a grid: provide Columns and Rows, or a valid expected Shot count.")
        regions = build_fallback_regions(fallback, gray, max_cells)
        return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions}

    # Polarity-independent separator detection (FIX1): a solid-color band
    # (near-white OR near-black OR any other uniform color) has almost no
    # edges, unlike photo/text content — so edge density, not a fixed
    # brightness assumption, is the primary signal for gutter vs. cell.
    # Edges alone would also miss a texture-less solid-fill panel (no gutter
    # at all, just one flat-colored cell) — so edges are combined with a
    # color-distance-from-background signal, where the background color
    # itself is sampled from the image's own border pixels rather than
    # assumed to be white: this stays correct whether the real background is
    # light, dark, or anything else.
    edges = auto_canny(gray)
    row_is_line, col_is_line = reinforce_with_hough_lines(edges, width, height)

    border_px = np.concatenate([
        gray[:3, :].ravel(), gray[-3:, :].ravel(),
        gray[:, :3].ravel(), gray[:, -3:].ravel(),
    ])
    background_estimate = float(np.median(border_px))
    color_content = np.abs(gray.astype(np.int16) - background_estimate) > COLOR_DISTANCE_THRESHOLD

    content = (edges > 0) | color_content
    row_density = np.mean(content, axis=1)
    col_density = np.mean(content, axis=0)
    # Long straight lines are treated as gutter regardless of local content
    # density around them — reinforces thin explicit border lines.
    row_density = np.where(row_is_line, 0.0, row_density)
    col_density = np.where(col_is_line, 0.0, col_density)

    min_gutter_run_rows = max(MIN_GUTTER_RUN_PX, int(height * MIN_GUTTER_RUN_FRACTION))
    min_gutter_run_cols = max(MIN_GUTTER_RUN_PX, int(width * MIN_GUTTER_RUN_FRACTION))
    row_gutters = find_gutter_runs(row_density, min_gutter_run_rows, EDGE_GUTTER_DENSITY_THRESHOLD, GUTTER_MERGE_GAP_PX)
    col_gutters = find_gutter_runs(col_density, min_gutter_run_cols, EDGE_GUTTER_DENSITY_THRESHOLD, GUTTER_MERGE_GAP_PX)

    row_bands = bands_from_gutters(row_gutters, height)
    col_bands = bands_from_gutters(col_gutters, width)

    candidates = []
    if row_bands and col_bands:
        min_area = width * height * MIN_CELL_FRACTION
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

    candidates.sort(key=lambda c: (c[0], c[1]))
    candidates = candidates[:max_cells]

    confidence = 0.0
    if candidates:
        grid_rows = len(row_bands)
        grid_cols = len(col_bands)
        expected_cells = grid_rows * grid_cols
        grid_regularity = min(1.0, len(candidates) / expected_cells) if expected_cells > 0 else 0.5
        avg_cell_w = width / max(grid_cols, 1)
        avg_cell_h = height / max(grid_rows, 1)
        avg_gutter_w = (sum(e - s for s, e in col_gutters) / len(col_gutters)) if col_gutters else 0
        avg_gutter_h = (sum(e - s for s, e in row_gutters) / len(row_gutters)) if row_gutters else 0
        gutter_strength = min(1.0, ((avg_gutter_w / max(avg_cell_w, 1)) + (avg_gutter_h / max(avg_cell_h, 1))))
        confidence = round(max(0.05, min(0.99, 0.5 * grid_regularity + 0.5 * gutter_strength)), 3)

    # FIX3 — Auto mode no longer only distrusts primary detection when it
    # found 0 or 1 region: a wrong-but-plausible count (e.g. 6 regions found
    # on an 8-Shot sheet) or a genuinely low confidence relative to the
    # chosen sensitivity profile are just as much reason to offer the
    # expected grid instead — always at low confidence, always editable,
    # never silently substituted.
    sensitivity_threshold = SENSITIVITY_THRESHOLDS.get(sensitivity, SENSITIVITY_THRESHOLDS["medium"])
    should_try_fallback = False
    if isinstance(expected_shot_count, int) and expected_shot_count > 1:
        if len(candidates) <= 1:
            should_try_fallback = True
        elif len(candidates) != expected_shot_count:
            should_try_fallback = True
        elif confidence < sensitivity_threshold:
            should_try_fallback = True

    if should_try_fallback:
        fallback = try_grid_fallback(width, height, expected_shot_count, columns, rows)
        if fallback is not None:
            regions = build_fallback_regions(fallback, gray, max_cells)
            return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions}
        # Auto-computed fallback unavailable (geometrically impossible) —
        # fall through and return whatever primary detection actually found,
        # even if that's an empty or mismatched-count result: never invent
        # a grid that wasn't explicitly requested and can't be built safely.

    if not candidates:
        return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": []}

    regions = [build_region(x0, y0, x1, y1, gray, confidence, "border") for (y0, x0, y1, x1) in candidates]
    return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions}


def cmd_detect(args):
    if not os.path.isfile(args.input):
        fail(f"Input file not found: {args.input}")
    expected_shot_count = args.expected_shots if (args.expected_shots is not None and args.expected_shots > 0) else None
    columns = args.columns if (args.columns is not None and args.columns > 0) else None
    rows = args.rows if (args.rows is not None and args.rows > 0) else None
    result = detect_regions(
        args.input,
        args.max_cells,
        expected_shot_count,
        mode=args.mode,
        columns=columns,
        rows=rows,
        sensitivity=args.sensitivity,
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


def main():
    parser = argparse.ArgumentParser(description="OpenCV Sequence Storyboard panel detector/extractor.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_detect = sub.add_parser("detect")
    p_detect.add_argument("--input", required=True)
    p_detect.add_argument("--max-cells", type=int, default=24)
    p_detect.add_argument("--expected-shots", type=int, default=None)
    p_detect.add_argument("--mode", choices=["auto", "grid"], default="auto")
    p_detect.add_argument("--columns", type=int, default=None)
    p_detect.add_argument("--rows", type=int, default=None)
    p_detect.add_argument("--sensitivity", choices=["low", "medium", "high"], default="medium")
    p_detect.set_defaults(func=cmd_detect)

    p_crop = sub.add_parser("crop")
    p_crop.add_argument("--input", required=True)
    p_crop.add_argument("--regions", required=True)
    p_crop.add_argument("--output-dir", required=True)
    p_crop.set_defaults(func=cmd_crop)

    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as e:  # noqa: BLE001 — must always emit the JSON contract, never a raw traceback
        fail(f"Unexpected error: {e}")


if __name__ == "__main__":
    main()
