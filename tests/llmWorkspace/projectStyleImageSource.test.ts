import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.IMAGE.SOURCE.2 (B20c) — the second image family, and the one B20e
// migrates onto.
//
// It exists to prove the three things that differ from `ASSET.REFERENCE_IMAGES`
// and that a single hard-coded query could not have expressed: a different
// storage root, a different per-file bound, and an **approval gate** the first
// family does not have.
//
// That gate is the one that matters. `runReferenceAnalysisAction` refuses an
// unapproved reference today; a source that ignored `approved_for_analysis`
// would silently drop that gate the moment B20e switched over.
// ---------------------------------------------------------------------------

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// Project Style's OWN root — deliberately not the Asset family's.
const TEST_RELATIVE_DIR = "uploads/project-style/references/b20c-test";
const TEST_ABSOLUTE_DIR = path.join(process.cwd(), "public", TEST_RELATIVE_DIR);

let ctx: TempDb;
let IMAGE_SOURCE_REGISTRY: typeof import("@/lib/llmWorkspace/images/registry").IMAGE_SOURCE_REGISTRY;
let projectId: number;
let otherProjectId: number;
let approvedA: number;
let approvedB: number;
let unapproved: number;
let foreign: number;
let unconfined: number;

async function insertReference(
  ownerProjectId: number,
  values: { imagePath: string; approvedForAnalysis?: boolean; label?: string | null }
): Promise<number> {
  const [row] = await ctx.db
    .insert(ctx.schema.projectStyleReferenceImages)
    .values({
      projectId: ownerProjectId,
      imagePath: values.imagePath,
      approvedForAnalysis: values.approvedForAnalysis ?? true,
      label: values.label ?? null,
    })
    .returning({ id: ctx.schema.projectStyleReferenceImages.id });
  return row.id;
}

async function writeFixture(filename: string): Promise<string> {
  await writeFile(path.join(TEST_ABSOLUTE_DIR, filename), Buffer.from(PNG_1X1_BASE64, "base64"));
  return `${TEST_RELATIVE_DIR}/${filename}`;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ IMAGE_SOURCE_REGISTRY } = await import("@/lib/llmWorkspace/images/registry"));
  await mkdir(TEST_ABSOLUTE_DIR, { recursive: true });

  projectId = await insertProject(ctx, "B20c project");
  otherProjectId = await insertProject(ctx, "B20c other project");

  approvedA = await insertReference(projectId, { imagePath: await writeFixture("a.png"), label: "Rooftop" });
  approvedB = await insertReference(projectId, { imagePath: await writeFixture("b.png"), label: "Interior" });
  unapproved = await insertReference(projectId, {
    imagePath: await writeFixture("c.png"),
    approvedForAnalysis: false,
  });
  foreign = await insertReference(otherProjectId, { imagePath: await writeFixture("d.png") });
  unconfined = await insertReference(projectId, { imagePath: "uploads/reference-images/elsewhere/x.png" });
});

afterAll(async () => {
  ctx.cleanup();
  await rm(TEST_ABSOLUTE_DIR, { recursive: true, force: true });
});

const source = () => IMAGE_SOURCE_REGISTRY["PROJECT_STYLE.REFERENCES"];

describe("B20c — the Project Style image source", () => {
  it("anchors on the project, not the asset", () => {
    expect(source().anchor).toBe("project");
  });

  it("resolves in the caller's order, never re-sorted", async () => {
    const result = await source().resolve(projectId, [approvedB, approvedA]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.images.map((i) => i.id)).toEqual([approvedB, approvedA]);
  });

  it("refuses a reference that is not approved for analysis", async () => {
    const result = await source().resolve(projectId, [approvedA, unapproved]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not approved for analysis");
  });

  it("refuses a reference belonging to another Project", async () => {
    const result = await source().resolve(projectId, [foreign]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("different Project");
  });

  it("refuses a stored path outside Project Style's own root — including the other family's root", async () => {
    const result = await source().resolve(projectId, [unconfined]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("outside the expected storage root");
  });

  it("refuses a duplicate and a missing id", async () => {
    const dup = await source().resolve(projectId, [approvedA, approvedA]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toContain("selected twice");

    const missing = await source().resolve(projectId, [999999]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("were not found");
  });

  it("carries the four metadata fields the analysis prompt puts in words — and never sourceUrl", async () => {
    const result = await source().resolve(projectId, [approvedA]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.images[0].metadata).sort()).toEqual([
      "label",
      "provenanceNotes",
      "whatInterestsMe",
      "whatToAvoid",
    ]);
    expect(result.images[0].metadata.label).toBe("Rooftop");
  });

  it("never exposes the path through metadata", async () => {
    const result = await source().resolve(projectId, [approvedA]);
    if (!result.ok) throw new Error("expected ok");
    expect(JSON.stringify(result.images[0].metadata)).not.toContain("uploads/");
  });

  it("uses Project Style's own bound and predicate, not the Asset family's", () => {
    const assetSource = IMAGE_SOURCE_REGISTRY["ASSET.REFERENCE_IMAGES"];
    // Different confinement rules: each family accepts only its own root.
    expect(source().isConfined("uploads/project-style/references/x.png")).toBe(true);
    expect(source().isConfined("uploads/reference-images/x.png")).toBe(false);
    expect(assetSource.isConfined("uploads/reference-images/x.png")).toBe(true);
    expect(assetSource.isConfined("uploads/project-style/references/x.png")).toBe(false);
  });
});
