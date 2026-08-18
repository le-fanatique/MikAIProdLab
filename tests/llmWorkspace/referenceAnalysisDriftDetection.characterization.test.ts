import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.REFANALYSIS.CHARACTERIZE.1 (B20d) — property (c), the hardest of the
// three: drift detection inside `runReferenceAnalysisAction` itself.
// `snapshot_changed` (checked in the ACQUISITION transaction, before the
// provider is ever called) and `provenance_mismatch` (checked in the
// FINALIZATION transaction, after the provider call, at commit time) are two
// distinct guards over two distinct windows.
//
// This action is `server-only`, transaction-bound and provider-bound, so it
// is driven through the real exported Server Action against a real (temp)
// database — the same shape `lightingFromImage.surface.test.ts` (B16b) uses
// for a simpler operation. No production file is modified: the two mutation
// points below are achieved by mocking `imageInputs.ts`'s and `provider.ts`'s
// exports FOR THE TEST ONLY (a real "concurrent write landed in between"
// cannot otherwise be reproduced deterministically without touching
// `runReferenceAnalysisAction`'s own control flow) — the mock's non-mutation
// branches always delegate to the real, unmodified implementation.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/projectStyle/referenceAnalysis/imageInputs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projectStyle/referenceAnalysis/imageInputs")>();
  return { ...actual, prepareReferenceImagesForAnalysis: vi.fn(actual.prepareReferenceImagesForAnalysis) };
});
vi.mock("@/lib/projectStyle/referenceAnalysis/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projectStyle/referenceAnalysis/provider")>();
  return { ...actual, callReferenceAnalysisProvider: vi.fn(actual.callReferenceAnalysisProvider) };
});

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TEST_SUBFOLDER = "b20d-drift-detection-test";
const TEST_RELATIVE_DIR = `uploads/project-style/references/${TEST_SUBFOLDER}`;
const TEST_ABSOLUTE_DIR = path.join(process.cwd(), "public", TEST_RELATIVE_DIR);

let ctx: TempDb;
let runReferenceAnalysisAction: typeof import("@/actions/projectStyleReferenceAnalysis").runReferenceAnalysisAction;
let getReferenceAnalysisRuntimeProfile: typeof import("@/actions/projectStyleReferenceAnalysis").getReferenceAnalysisRuntimeProfile;
let prepareReferenceImagesForAnalysis: typeof import("@/lib/projectStyle/referenceAnalysis/imageInputs").prepareReferenceImagesForAnalysis;
let callReferenceAnalysisProvider: typeof import("@/lib/projectStyle/referenceAnalysis/provider").callReferenceAnalysisProvider;
/** The real, unmodified implementation — captured once so the mutation-then-delegate mocks below never re-import it per call. */
let actualPrepareReferenceImagesForAnalysis: typeof import("@/lib/projectStyle/referenceAnalysis/imageInputs").prepareReferenceImagesForAnalysis;

function mockedPrepare() {
  return prepareReferenceImagesForAnalysis as unknown as ReturnType<typeof vi.fn>;
}
function mockedProvider() {
  return callReferenceAnalysisProvider as unknown as ReturnType<typeof vi.fn>;
}

function validAnalysisText(): string {
  return JSON.stringify({
    schemaVersion: 1,
    summary: "A short factual summary.",
    observations: [
      {
        referenceKey: "R1",
        domain: null,
        observation: "Cool blue rim light from the left.",
        rationale: null,
        confidence: "high",
        uncertainty: null,
      },
    ],
    candidateRules: [],
  });
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runReferenceAnalysisAction, getReferenceAnalysisRuntimeProfile } = await import(
    "@/actions/projectStyleReferenceAnalysis"
  ));
  ({ prepareReferenceImagesForAnalysis } = await import("@/lib/projectStyle/referenceAnalysis/imageInputs"));
  ({ callReferenceAnalysisProvider } = await import("@/lib/projectStyle/referenceAnalysis/provider"));
  ({ prepareReferenceImagesForAnalysis: actualPrepareReferenceImagesForAnalysis } = await vi.importActual<
    typeof import("@/lib/projectStyle/referenceAnalysis/imageInputs")
  >("@/lib/projectStyle/referenceAnalysis/imageInputs"));

  await mkdir(TEST_ABSOLUTE_DIR, { recursive: true });
});

afterAll(async () => {
  ctx.cleanup();
  await rm(TEST_ABSOLUTE_DIR, { recursive: true, force: true });
});

async function insertReferenceImage(projectId: number, label: string): Promise<number> {
  const filename = `${label.replace(/[^a-z0-9]/gi, "-")}.png`;
  await writeFile(path.join(TEST_ABSOLUTE_DIR, filename), Buffer.from(PNG_1X1_BASE64, "base64"));
  const [row] = await ctx.db
    .insert(ctx.schema.projectStyleReferenceImages)
    .values({
      projectId,
      imagePath: `${TEST_RELATIVE_DIR}/${filename}`,
      label,
      approvedForAnalysis: true,
    })
    .returning({ id: ctx.schema.projectStyleReferenceImages.id });
  return row.id;
}

async function confirmedInput(projectId: number, referenceIds: number[], requestKey: string) {
  const profile = await getReferenceAnalysisRuntimeProfile();
  return {
    projectId,
    referenceIds,
    requestKey,
    confirmedProvider: profile.provider,
    confirmedModel: profile.model,
    confirmedFingerprint: profile.fingerprint,
  };
}

describe("Reference analysis drift detection — snapshot_changed, caught in the ACQUISITION transaction before any provider call", () => {
  it("refuses when a Reference's metadata changes between the pre-call snapshot and the acquisition transaction, and never calls the provider", async () => {
    const projectId = await insertProject(ctx, "B20d snapshot_changed project");
    const referenceId = await insertReferenceImage(projectId, "Original label");

    mockedProvider().mockClear();
    // Mutates the DB row as a side effect of preparing the images — this runs
    // AFTER `runReferenceAnalysisActionImpl`'s Step 3 (the snapshot read and
    // `canonicalByRef` capture) and BEFORE Step 5 (the acquisition
    // transaction's `recheckReferenceInTx`), which is exactly the window the
    // ticket names as `snapshot_changed`'s trigger.
    mockedPrepare().mockImplementationOnce(async (refs) => {
      await ctx.db
        .update(ctx.schema.projectStyleReferenceImages)
        .set({ label: "Mutated between snapshot and acquisition" })
        .where(eq(ctx.schema.projectStyleReferenceImages.id, referenceId));
      return actualPrepareReferenceImagesForAnalysis(refs);
    });

    const input = await confirmedInput(projectId, [referenceId], "11111111-1111-4111-8111-111111111111");
    const result = await runReferenceAnalysisAction(input);

    expect(result).toEqual({
      ok: false,
      error: `Reference ${referenceId} changed just before the run started. Please retry.`,
    });
    expect(mockedProvider()).not.toHaveBeenCalled();

    // No Run row was ever committed for this attempt — the acquisition
    // transaction's insert only happens after every recheck passes.
    const runs = await ctx.db
      .select()
      .from(ctx.schema.projectStyleReferenceAnalysisRuns)
      .where(eq(ctx.schema.projectStyleReferenceAnalysisRuns.projectId, projectId));
    expect(runs).toHaveLength(0);
  });

  it("still refuses, unchanged, when the drift is a domain added between snapshot and acquisition rather than a text field", async () => {
    const projectId = await insertProject(ctx, "B20d snapshot_changed domain project");
    const referenceId = await insertReferenceImage(projectId, "Domain drift reference");

    mockedProvider().mockClear();
    mockedPrepare().mockImplementationOnce(async (refs) => {
      await ctx.db.insert(ctx.schema.projectStyleReferenceDomains).values({ referenceId, domain: "lighting" });
      return actualPrepareReferenceImagesForAnalysis(refs);
    });

    const input = await confirmedInput(projectId, [referenceId], "22222222-2222-4222-8222-222222222222");
    const result = await runReferenceAnalysisAction(input);

    expect(result).toEqual({
      ok: false,
      error: `Reference ${referenceId} changed just before the run started. Please retry.`,
    });
    expect(mockedProvider()).not.toHaveBeenCalled();
  });
});

describe("Reference analysis drift detection — provenance_mismatch, caught in the FINALIZATION transaction at commit time", () => {
  it("refuses and marks the Run failed when the acquired Run row itself is altered while the provider call is in flight", async () => {
    const projectId = await insertProject(ctx, "B20d provenance_mismatch project");
    const referenceId = await insertReferenceImage(projectId, "Provenance mismatch reference");

    mockedPrepare().mockClear();
    mockedProvider().mockImplementationOnce(async () => {
      // Simulates the Run row being altered (e.g. by a concurrent, unrelated
      // write) AFTER acquisition committed but BEFORE finalization re-reads
      // it — the exact window `provenance_mismatch` exists to catch. Runs
      // AFTER acquisition (the row now exists) and BEFORE finalization reads
      // it back, because this mock stands in for the provider call itself,
      // which happens strictly between those two transactions.
      const [runRow] = await ctx.db
        .select()
        .from(ctx.schema.projectStyleReferenceAnalysisRuns)
        .where(
          and(
            eq(ctx.schema.projectStyleReferenceAnalysisRuns.projectId, projectId),
            eq(ctx.schema.projectStyleReferenceAnalysisRuns.status, "running")
          )
        );
      expect(runRow).toBeDefined();
      await ctx.db
        .update(ctx.schema.projectStyleReferenceAnalysisRuns)
        .set({ promptHash: "corrupted-prompt-hash" })
        .where(eq(ctx.schema.projectStyleReferenceAnalysisRuns.id, runRow.id));

      // The real provider is deliberately not called — this test proves
      // `provenance_mismatch`, which needs no network/LLM at all.
      return { ok: true, text: validAnalysisText() } as const;
    });

    const input = await confirmedInput(projectId, [referenceId], "33333333-3333-4333-8333-333333333333");
    const result = await runReferenceAnalysisAction(input);

    expect(result).toEqual({
      ok: false,
      error: "The analysis run's provenance no longer matches what was acquired.",
    });

    const [runAfter] = await ctx.db
      .select()
      .from(ctx.schema.projectStyleReferenceAnalysisRuns)
      .where(eq(ctx.schema.projectStyleReferenceAnalysisRuns.projectId, projectId));
    expect(runAfter.status).toBe("failed");
    expect(runAfter.errorCode).toBe("provenance_mismatch");

    // Zero partial writes: no observation or candidate rule was persisted
    // for this Run despite the provider having "answered" successfully.
    const observations = await ctx.db
      .select()
      .from(ctx.schema.projectStyleReferenceAnalysisObservations)
      .where(eq(ctx.schema.projectStyleReferenceAnalysisObservations.runId, runAfter.id));
    expect(observations).toHaveLength(0);
  });

  it("commits normally, with the observation persisted, when nothing drifts between acquisition and finalization", async () => {
    const projectId = await insertProject(ctx, "B20d clean commit project");
    const referenceId = await insertReferenceImage(projectId, "Clean commit reference");

    mockedPrepare().mockClear();
    mockedProvider().mockImplementationOnce(async () => ({ ok: true, text: validAnalysisText() }) as const);

    const input = await confirmedInput(projectId, [referenceId], "44444444-4444-4444-8444-444444444444");
    const result = await runReferenceAnalysisAction(input);

    expect(result.ok).toBe(true);
    if (!result.ok || result.requiresConfirmation) throw new Error("unreachable");
    const runId = result.runId;

    const [run] = await ctx.db
      .select()
      .from(ctx.schema.projectStyleReferenceAnalysisRuns)
      .where(eq(ctx.schema.projectStyleReferenceAnalysisRuns.id, runId));
    expect(run.status).toBe("completed");

    const observations = await ctx.db
      .select()
      .from(ctx.schema.projectStyleReferenceAnalysisObservations)
      .where(eq(ctx.schema.projectStyleReferenceAnalysisObservations.runId, runId));
    expect(observations).toHaveLength(1);
    expect(observations[0].referenceId).toBe(referenceId);
  });
});
