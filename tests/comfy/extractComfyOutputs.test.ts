import { describe, expect, it } from "vitest";
import {
  extractComfyOutputs,
  extractFirstComfyOutput,
  type ComfyHistoryResponse,
} from "@/lib/comfy/comfyServerClient";

// ---------------------------------------------------------------------------
// GEN.MULTIOUT.1 (G1) — the read becomes plural.
//
// Measured on job 544 (`Grid2Batch`, asset 51, provider cloud): Comfy Cloud
// returned FOUR images on node 5 and MikAI stored one. The graph is
// LoadImage → ImageGridtoBatch → SaveImage, so a batch of N lands on a single
// SaveImage which writes N files into a single `images` array.
//
// `extractFirstComfyOutput` was not wrong — it was an assumption ("one job,
// one output") never reopened. This step widens the read and CHANGES NOTHING
// ELSE: the old function stays, as a thin adapter over the new one, so all its
// callers keep the exact behaviour they had. That is what makes G1 shippable
// on its own, and what puts the net in place before the runtime moves.
//
// Both the singular and the plural form are asserted on the same fixtures, so
// the adapter cannot drift away from the function it wraps.
// ---------------------------------------------------------------------------

const PROMPT = "cead3401-3970-4497-9577-3effa2c74e46";

function history(outputs: Record<string, unknown>): ComfyHistoryResponse {
  return { [PROMPT]: { outputs } } as ComfyHistoryResponse;
}

/** The real shape of job 544's response, filenames shortened. */
const JOB_544 = history({
  "5": {
    images: [
      { filename: "1cb75e72.png", subfolder: "", type: "output" },
      { filename: "306a7a3c.png", subfolder: "", type: "output" },
      { filename: "3576b98f.png", subfolder: "", type: "output" },
      { filename: "36f6d5f8.png", subfolder: "", type: "output" },
    ],
  },
});

describe("extractComfyOutputs — every file, not just the first", () => {
  it("returns the four images job 544 actually produced", () => {
    const files = extractComfyOutputs(JOB_544, PROMPT);

    expect(files.map((f) => f.filename)).toEqual([
      "1cb75e72.png",
      "306a7a3c.png",
      "3576b98f.png",
      "36f6d5f8.png",
    ]);
  });

  it("keeps the batch order inside a node exactly as ComfyUI gave it", () => {
    // This is the order the user sees as "panel 1, panel 2, panel 3, panel 4"
    // of a grid. Sorting it, or relying on the filenames, would scramble a
    // storyboard sheet — the filenames here are content hashes, so their
    // alphabetical order is meaningless.
    const files = extractComfyOutputs(
      history({ "5": { images: [{ filename: "z-first.png" }, { filename: "a-second.png" }] } }),
      PROMPT
    );

    expect(files.map((f) => f.filename)).toEqual(["z-first.png", "a-second.png"]);
  });

  it("collects from every node of the winning kind, not only the first", () => {
    const files = extractComfyOutputs(
      history({
        "5": { images: [{ filename: "a.png" }] },
        "9": { images: [{ filename: "b.png" }, { filename: "c.png" }] },
      }),
      PROMPT
    );

    expect(files.map((f) => f.filename)).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("orders nodes by ascending id, which is what JS does with numeric keys", () => {
    // Written down because it is a language rule, not a choice: object keys
    // that look like integers are visited in ascending numeric order whatever
    // the JSON said. Deterministic and stable — but it must never be described
    // as "ComfyUI's order". Only the order INSIDE a node is that.
    const files = extractComfyOutputs(
      history({
        "10": { images: [{ filename: "from-ten.png" }] },
        "9": { images: [{ filename: "from-nine.png" }] },
      }),
      PROMPT
    );

    expect(files.map((f) => f.filename)).toEqual(["from-nine.png", "from-ten.png"]);
  });

  it("carries the category ComfyUI filed each file under", () => {
    // The kind travels with the file so `generation_job_outputs.kind` records
    // the source's own answer, not a guess from the extension. Note the
    // deliberately misleading name: a `.png` filed under `videos` stays a
    // video here, because ComfyUI said so.
    expect(extractComfyOutputs(JOB_544, PROMPT).map((f) => f.kind)).toEqual([
      "image",
      "image",
      "image",
      "image",
    ]);
    expect(
      extractComfyOutputs(history({ "5": { gifs: [{ filename: "a.gif" }] } }), PROMPT)[0].kind
    ).toBe("gif");
    expect(
      extractComfyOutputs(history({ "5": { videos: [{ filename: "lying.png" }] } }), PROMPT)[0].kind
    ).toBe("video");
  });

  it("keeps the videos → gifs → images priority, and never mixes kinds", () => {
    const files = extractComfyOutputs(
      history({
        "5": { images: [{ filename: "ignored.png" }] },
        "6": { videos: [{ filename: "kept-1.mp4" }, { filename: "kept-2.mp4" }] },
        "7": { gifs: [{ filename: "ignored.gif" }] },
      }),
      PROMPT
    );

    expect(files.map((f) => f.filename)).toEqual(["kept-1.mp4", "kept-2.mp4"]);
  });

  it("falls through to gifs when no node carries a video", () => {
    const files = extractComfyOutputs(
      history({
        "5": { images: [{ filename: "ignored.png" }] },
        "6": { gifs: [{ filename: "kept.gif" }] },
      }),
      PROMPT
    );

    expect(files.map((f) => f.filename)).toEqual(["kept.gif"]);
  });

  it("ignores an empty array rather than letting it win its category", () => {
    const files = extractComfyOutputs(
      history({ "5": { videos: [] }, "6": { images: [{ filename: "kept.png" }] } }),
      PROMPT
    );

    expect(files.map((f) => f.filename)).toEqual(["kept.png"]);
  });

  it("returns an empty list for a prompt it does not know", () => {
    expect(extractComfyOutputs(JOB_544, "some-other-prompt")).toEqual([]);
  });

  it("returns an empty list when the entry carries no outputs at all", () => {
    expect(extractComfyOutputs({ [PROMPT]: {} } as ComfyHistoryResponse, PROMPT)).toEqual([]);
    expect(
      extractComfyOutputs({ [PROMPT]: { outputs: "nope" } } as unknown as ComfyHistoryResponse, PROMPT)
    ).toEqual([]);
  });

  it("returns an empty list when a node has only unrecognized keys", () => {
    // A PLY job looks like this — and must keep falling through to
    // extractPlyComfyOutput, which is the caller's next branch.
    expect(
      extractComfyOutputs(history({ "5": { ply_file: [{ filename: "scene.ply" }] } }), PROMPT)
    ).toEqual([]);
  });
});

describe("extractFirstComfyOutput — unchanged, and provably so", () => {
  it("still returns the first of several, exactly as before", () => {
    expect(extractFirstComfyOutput(JOB_544, PROMPT)?.filename).toBe("1cb75e72.png");
  });

  it("agrees with the plural form on every fixture", () => {
    const fixtures: ComfyHistoryResponse[] = [
      JOB_544,
      history({ "5": { images: [{ filename: "only.png" }] } }),
      history({ "5": { videos: [{ filename: "v.mp4" }], images: [{ filename: "i.png" }] } }),
      history({ "5": { gifs: [{ filename: "g.gif" }] } }),
      history({ "5": { videos: [] } }),
      history({}),
    ];

    for (const h of fixtures) {
      expect(extractFirstComfyOutput(h, PROMPT)).toEqual(extractComfyOutputs(h, PROMPT)[0] ?? null);
    }
  });

  it("still answers null on an unknown prompt and on an entry with no outputs", () => {
    expect(extractFirstComfyOutput(JOB_544, "unknown")).toBeNull();
    expect(extractFirstComfyOutput({ [PROMPT]: {} } as ComfyHistoryResponse, PROMPT)).toBeNull();
  });
});
