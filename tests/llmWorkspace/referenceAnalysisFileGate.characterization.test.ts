import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { prepareReferenceImagesForAnalysis } from "@/lib/projectStyle/referenceAnalysis/imageInputs";
import { REFERENCE_ANALYSIS_LIMITS } from "@/lib/projectStyle/referenceAnalysis/contracts";
import { MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES } from "@/lib/projectStyle/uploadReferenceImage";

// ---------------------------------------------------------------------------
// Minimal, dependency-free PNG encoder used ONLY to build large-but-real
// decodable fixture images for the total-byte-budget test below (a solid-
// color image, `zlib` at compression level 0 so its encoded size tracks the
// requested pixel count closely rather than collapsing to near-nothing).
// Standalone CRC-32 (the PNG chunk checksum) — no new package dependency.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/** A real, ffmpeg-decodable solid-black RGB PNG of the given pixel size. */
function buildRealPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk("IHDR", ihdrData);

  const rowBytes = 1 + width * 3; // filter byte + RGB
  const raw = Buffer.alloc(rowBytes * height, 0); // filter=0, black pixels
  const compressed = deflateSync(raw, { level: 0 });
  const idat = pngChunk("IDAT", compressed);

  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ---------------------------------------------------------------------------
// LLMW.REFANALYSIS.CHARACTERIZE.1 (B20d) — property (a): the file
// confinement/decode gate `prepareReferenceImagesForAnalysis` enforces before
// any byte of a Reference Board image ever reaches a provider.
//
// A characterization suite: it documents `imageInputs.ts` as it behaves
// TODAY, so B20e can rewrite `runReferenceAnalysisAction` around it and know
// immediately if this gate stopped refusing what it refuses now. No
// production file is touched by this ticket.
//
// Deliberately does NOT go through `runReferenceAnalysisAction` (server DB,
// LLM Settings, a real provider call) — `prepareReferenceImagesForAnalysis`
// takes a plain `{ referenceId, imagePath }[]` and returns a result, exactly
// as the ticket names it as "the most testable" of the three properties.
//
// Real files are written under `public/uploads/project-style/references/`
// because that is exactly the root `isConfinedReferenceImagePath` requires
// and what `imageInputs.ts` resolves against — this module has ITS OWN
// confined root, distinct from Asset reference images'
// `uploads/reference-images/` that `imageInput.runner.test.ts` (B16a) uses.
// ---------------------------------------------------------------------------

/** A real, decodable 1x1 PNG — the decode gate and the ffprobe dimension read are not mocked. */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TEST_SUBFOLDER = "b20d-reference-analysis-gate-test";
const TEST_RELATIVE_DIR = `uploads/project-style/references/${TEST_SUBFOLDER}`;
const TEST_ABSOLUTE_DIR = path.join(process.cwd(), "public", TEST_RELATIVE_DIR);

async function writeFixtureFile(filename: string, bytes: Buffer): Promise<string> {
  await writeFile(path.join(TEST_ABSOLUTE_DIR, filename), bytes);
  return `${TEST_RELATIVE_DIR}/${filename}`;
}

beforeAll(async () => {
  await mkdir(TEST_ABSOLUTE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_ABSOLUTE_DIR, { recursive: true, force: true });
});

describe("Reference Board analysis — the confinement gate refuses before any read", () => {
  it("refuses a stored path outside the family's own confined root", async () => {
    const result = await prepareReferenceImagesForAnalysis([
      { referenceId: 1, imagePath: "uploads/somewhere-else/x.png" },
    ]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored path is not confined." });
  });

  it("refuses an Asset reference-image path — a different registry's confined root, not this one's", async () => {
    // Documents the exact drift risk B20c must not create: Project Style's
    // reference images live under a DIFFERENT confined root than Asset
    // reference images (`uploads/reference-images/`, B16a's root). A path
    // confined for one family must never be accepted by the other's gate.
    const result = await prepareReferenceImagesForAnalysis([
      { referenceId: 1, imagePath: "uploads/reference-images/x.png" },
    ]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored path is not confined." });
  });
});

describe("Reference Board analysis — the decode gate refuses a missing, empty or oversized file", () => {
  it("refuses a missing file", async () => {
    const result = await prepareReferenceImagesForAnalysis([
      { referenceId: 1, imagePath: `${TEST_RELATIVE_DIR}/never-written.png` },
    ]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored file is missing or unreadable." });
  });

  it("refuses an empty file", async () => {
    const imagePath = await writeFixtureFile("empty.png", Buffer.alloc(0));
    const result = await prepareReferenceImagesForAnalysis([{ referenceId: 1, imagePath }]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored file is empty." });
  });

  it("refuses a file over the per-file size limit", async () => {
    const oversized = Buffer.alloc(MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES + 1, 0x41);
    const imagePath = await writeFixtureFile("oversized.png", oversized);
    const result = await prepareReferenceImagesForAnalysis([{ referenceId: 1, imagePath }]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored file exceeds the per-file size limit." });
  }, 20_000);

  it("refuses the selection when the TOTAL raw bytes exceed the batch limit, even with every file individually under the per-file limit", async () => {
    // The per-file/total checks run BEFORE the magic-byte sniff and decode of
    // THAT SAME file, so only the files that stay under the running total need
    // to be real, decodable images (references 1 and 2 below) — the one that
    // actually tips the total over the limit (reference 3) never reaches its
    // own magic/decode check and can be arbitrary bytes. Each of the two real
    // images is ~8.6 MiB (under the 10 MiB per-file cap); their sum with the
    // third pushes the running total past `maxTotalRawBytes` (20 MiB).
    const realImageBytes = buildRealPng(1900, 1600); // 1 + 1900*3 = 5701 bytes/row * 1600 rows ≈ 9.12 MiB
    expect(realImageBytes.length).toBeLessThan(MAX_PROJECT_STYLE_IMAGE_SIZE_BYTES);
    const junkBytes = Buffer.alloc(3 * 1024 * 1024, 0x42);

    const paths = await Promise.all([
      writeFixtureFile("total-a.png", realImageBytes),
      writeFixtureFile("total-b.png", realImageBytes),
      writeFixtureFile("total-c.bin", junkBytes),
    ]);
    expect(2 * realImageBytes.length + junkBytes.length).toBeGreaterThan(REFERENCE_ANALYSIS_LIMITS.maxTotalRawBytes);

    const result = await prepareReferenceImagesForAnalysis(
      paths.map((imagePath, i) => ({ referenceId: i + 1, imagePath }))
    );
    expect(result).toEqual({
      ok: false,
      error: `Selected references exceed the total ${REFERENCE_ANALYSIS_LIMITS.maxTotalRawBytes} byte limit.`,
    });
  }, 20_000);
});

describe("Reference Board analysis — the decode gate refuses a non-real or undecodable image", () => {
  it("refuses a file whose real bytes are not PNG, JPEG or WebP (magic-byte sniff, not the extension)", async () => {
    const imagePath = await writeFixtureFile("fake.png", Buffer.from("not an image at all", "utf8"));
    const result = await prepareReferenceImagesForAnalysis([{ referenceId: 1, imagePath }]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored file is not a real PNG, JPEG or WebP." });
  });

  it("refuses a real GIF — a format the Reference Board upload path itself never accepts here either", async () => {
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    const imagePath = await writeFixtureFile("real.gif", gif);
    const result = await prepareReferenceImagesForAnalysis([{ referenceId: 1, imagePath }]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored file is not a real PNG, JPEG or WebP." });
  });

  it("refuses a file with a valid PNG magic header but undecodable body", async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const junk = Buffer.alloc(256, 0x00);
    const imagePath = await writeFixtureFile("corrupt.png", Buffer.concat([pngHeader, junk]));
    const result = await prepareReferenceImagesForAnalysis([{ referenceId: 1, imagePath }]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored file could not be decoded." });
  });
});

describe("Reference Board analysis — the whole batch is refused on the first failure, never a partial result", () => {
  it("refuses the batch and stops at the first bad reference, even when a good one precedes it", async () => {
    const goodPath = await writeFixtureFile("good-first.png", Buffer.from(PNG_1X1_BASE64, "base64"));
    const result = await prepareReferenceImagesForAnalysis([
      { referenceId: 1, imagePath: goodPath },
      { referenceId: 2, imagePath: `${TEST_RELATIVE_DIR}/never-written-2.png` },
    ]);
    expect(result).toEqual({ ok: false, error: "Reference 2: stored file is missing or unreadable." });
  });

  it("never evaluates a later reference once an earlier one already failed", async () => {
    // Reference 2's path is also unconfined AND would itself fail — if the
    // batch were evaluated out of order or partially, the error could name
    // reference 2. It must always name the FIRST failing reference in the
    // given order.
    const result = await prepareReferenceImagesForAnalysis([
      { referenceId: 1, imagePath: "uploads/elsewhere/one.png" },
      { referenceId: 2, imagePath: "uploads/elsewhere/two.png" },
    ]);
    expect(result).toEqual({ ok: false, error: "Reference 1: stored path is not confined." });
  });

  it("accepts a real, decodable, confined, in-budget image and returns its computed sha256/mime/dimensions", async () => {
    const bytes = Buffer.from(PNG_1X1_BASE64, "base64");
    const imagePath = await writeFixtureFile("accepted.png", bytes);
    const result = await prepareReferenceImagesForAnalysis([{ referenceId: 42, imagePath }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      referenceId: 42,
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
    expect(result.images[0].imageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.images[0].base64).toBe(PNG_1X1_BASE64);
  });
});
