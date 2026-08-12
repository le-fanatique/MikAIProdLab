# Gaussian Camera MVP

Last updated: 2026-07-20

## Product Goal

From a MikAI Shot, the user selects an authorized source image, runs the SHARP
ComfyUI workflow, loads the resulting Gaussian Splat PLY in an integrated
viewer, chooses a camera framing, captures at the exact source resolution, and
explicitly saves that snapshot as a Shot reference with role `camera`.

## Confirmed Real Workflow Facts

Source workflow inspected:
`C:\Users\HYPERWORKED\Downloads\Gaussian.json`.

- `SharpPredict` output 0 is named `ply_path` and has Comfy type `STRING`.
- `GeomPackPreviewGaussian` consumes that path and is an output node.
- The current JSON has no `(Input)` or `(Output)` title markers, so MikAI's
  existing generic mapper will not expose it without an adapted workflow or a
  dedicated Camera Lab mapping.
- The current workflow keeps `focal_length_mm: 23`; the Camera MVP must not
  invent focal estimation or silently replace this workflow value.

Real ComfyUI observation on 2026-07-20:

```text
prompt id: 050251bf-2b01-4ead-821e-41bf81c4e253
outputs[77].ply_file: sharp_1784553563069.ply
outputs[77].filename: sharp_1784553563069.ply
reported size: 63.0 MB
actual bytes: 66,060,651
```

`GET /view?filename=sharp_1784553563069.ply&type=output` returned HTTP 206 for
a Range request, `application/octet-stream`, `Accept-Ranges: bytes`, and the
correct total size. The file is present under the configured ComfyUI output
root and is a binary little-endian PLY with 1,179,648 vertices and standard
Gaussian properties for position, SH color, opacity, scale, and rotation.

## Security Boundary

MikAI must derive downloads from structured history metadata and the configured
ComfyUI `/view` endpoint. It must never trust or read an arbitrary absolute path
returned by a custom node. Filename, extension, storage type, response size,
PLY header, and destination confinement must be validated before publication
into MikAI-managed cache storage.

## Delivery Gates

1. `CAMLAB.SPIKE.1`: complete. The real output contract was reproduced and
   PlayCanvas was selected using a real PLY.
2. `CAMLAB.PLY.1`: complete (`679b5c2`). Comfy PLY artifacts are validated,
   atomically cached and served with Range support without changing image or
   video output behavior.
3. `CAMLAB.VIEWER.1`: integrate camera controls and exact-resolution offscreen
   capture.
4. `CAMLAB.SHOTREF.1`: validate and persist the confirmed snapshot as a Shot
   reference with role `camera`.

No complex Camera Lab table is required for the MVP while the PLY remains a
job/cache artifact. Reopening multiple durable splats or poses would require a
new Codex data-model arbitration.

## License Gate

Technical local experimentation may proceed. Product delivery using official
SHARP weights must not be approved until a compatible license, separate
authorization, or formal legal decision is available.
