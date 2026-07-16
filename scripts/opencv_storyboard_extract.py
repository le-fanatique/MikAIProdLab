#!/usr/bin/env python3
"""
opencv_storyboard_extract.py — SEQGEN.STORYBOARD.EXTRACT.1

Detects bordered/gutter-separated panels ("cells") in a Sequence Storyboard
contact-sheet image, and crops confirmed regions on request. Talks to the
Node server exclusively via a strict JSON contract on stdout — never writes
to public/uploads directly (the server action owns validating and copying
any output file into permanent storage).

Two subcommands:

  detect --input <path> [--max-cells N]
    Analyzes the image and prints a JSON object describing candidate
    regions, in reading order (top-to-bottom, left-to-right), each with a
    confidence score and a best-effort illustration/caption split.

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
GUTTER_DENSITY_THRESHOLD = 0.02  # rows/cols with <2% non-white content are "gutter-like"
MIN_GUTTER_RUN_PX = 4  # a gutter band must be at least this many px wide to count
CAPTION_WHITENESS_THRESHOLD = 0.85
CAPTION_MIN_RUN_PX = 12


def eprint(*args):
    print(*args, file=sys.stderr)


def fail(message: str):
    print(json.dumps({"ok": False, "error": message}))
    sys.exit(1)


def find_gutter_runs(density: np.ndarray, min_run: int) -> list[tuple[int, int]]:
    """Returns [(start, end)] index ranges where `density` stays below the
    gutter threshold for at least `min_run` consecutive samples."""
    runs = []
    start = None
    for i, v in enumerate(density):
        is_gutter = v < GUTTER_DENSITY_THRESHOLD
        if is_gutter and start is None:
            start = i
        elif not is_gutter and start is not None:
            if i - start >= min_run:
                runs.append((start, i))
            start = None
    if start is not None and len(density) - start >= min_run:
        runs.append((start, len(density)))
    return runs


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
    lower half for a sustained near-white band (a caption background).
    Returns (illustrationHeight, textSeparationDetected)."""
    h, w = cell_gray.shape
    search_start = h // 2
    whiteness = np.mean(cell_gray[search_start:h, :] > 240, axis=1)

    run_start = None
    for i, v in enumerate(whiteness):
        if v > CAPTION_WHITENESS_THRESHOLD:
            if run_start is None:
                run_start = i
            if i - run_start + 1 >= CAPTION_MIN_RUN_PX:
                # Sustained whitish run found — treat its start as the
                # illustration/caption boundary.
                boundary = search_start + run_start
                return boundary, True
        else:
            run_start = None
    return None, False


def detect_regions(input_path: str, max_cells: int) -> dict:
    img = cv2.imread(input_path)
    if img is None:
        fail(f"Could not read image: {input_path}")

    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Content mask: darker/saturated pixels count as "content", near-white
    # pixels count as background/gutter. Otsu handles varying exposure.
    _, content_mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    content = content_mask > 0

    row_density = np.mean(content, axis=1)
    col_density = np.mean(content, axis=0)

    min_gutter_run_rows = max(MIN_GUTTER_RUN_PX, int(height * 0.004))
    min_gutter_run_cols = max(MIN_GUTTER_RUN_PX, int(width * 0.004))

    row_gutters = find_gutter_runs(row_density, min_gutter_run_rows)
    col_gutters = find_gutter_runs(col_density, min_gutter_run_cols)

    row_bands = bands_from_gutters(row_gutters, height)
    col_bands = bands_from_gutters(col_gutters, width)

    if not row_bands or not col_bands:
        return {
            "ok": True,
            "sourceWidth": width,
            "sourceHeight": height,
            "regions": [],
        }

    min_area = width * height * MIN_CELL_FRACTION
    candidates = []
    for (y0, y1) in row_bands:
        for (x0, x1) in col_bands:
            cell_w = x1 - x0
            cell_h = y1 - y0
            if cell_w * cell_h < min_area:
                continue
            # Skip cells with negligible content (likely a stray gutter
            # sliver that survived band reconstruction).
            cell_content = content[y0:y1, x0:x1]
            if np.mean(cell_content) < 0.01:
                continue
            candidates.append((y0, x0, y1, x1))

    if not candidates:
        return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": []}

    # Reading order: top-to-bottom, then left-to-right within each row band.
    candidates.sort(key=lambda c: (c[0], c[1]))
    candidates = candidates[:max_cells]

    grid_rows = len(row_bands)
    grid_cols = len(col_bands)
    expected_cells = grid_rows * grid_cols
    # Confidence heuristic: reward a clean rectangular grid (actual cell
    # count close to rows*cols) and non-trivial gutters relative to cell
    # size; never fabricated beyond these two observable signals.
    grid_regularity = min(1.0, len(candidates) / expected_cells) if expected_cells > 0 else 0.5
    avg_cell_w = width / max(grid_cols, 1)
    avg_cell_h = height / max(grid_rows, 1)
    avg_gutter_w = (sum(e - s for s, e in col_gutters) / len(col_gutters)) if col_gutters else 0
    avg_gutter_h = (sum(e - s for s, e in row_gutters) / len(row_gutters)) if row_gutters else 0
    gutter_strength = min(1.0, ((avg_gutter_w / max(avg_cell_w, 1)) + (avg_gutter_h / max(avg_cell_h, 1))))
    confidence = round(max(0.05, min(0.99, 0.5 * grid_regularity + 0.5 * gutter_strength)), 3)

    regions = []
    for (y0, x0, y1, x1) in candidates:
        cell_gray = gray[y0:y1, x0:x1]
        illustration_height, text_detected = detect_illustration_split(cell_gray)
        regions.append(
            {
                "x": int(x0),
                "y": int(y0),
                "width": int(x1 - x0),
                "height": int(y1 - y0),
                "confidence": confidence,
                "detectionMode": "border",
                "illustrationHeight": int(illustration_height) if illustration_height is not None else None,
                "textSeparationDetected": bool(text_detected),
            }
        )

    return {"ok": True, "sourceWidth": width, "sourceHeight": height, "regions": regions}


def cmd_detect(args):
    if not os.path.isfile(args.input):
        fail(f"Input file not found: {args.input}")
    result = detect_regions(args.input, args.max_cells)
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
