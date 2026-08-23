import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.VARLIB.1 (B6c2) — `resolveVariableLibraryRows`
// (`src/lib/llmWorkspace/variableLibrary.ts`), the read logic behind the
// variable library page. Four properties, per the ticket's own "Validation
// attendue":
//
//   (i)   every variable of `VARIABLE_REGISTRY` appears in the result, for a
//         full selection — asserted against `VARIABLE_REGISTRY`'s own keys,
//         never a hand-written list, so a 23rd variable added tomorrow is
//         covered automatically;
//   (ii)  anchor filtering is correct in both directions — a variable whose
//         required id is present resolves, one whose required id is absent
//         is "unresolved", never an error;
//   (iii) THE trap: one resolver throwing (a stale `sequenceId` pointing at
//         nothing) leaves every other variable resolved — proving the
//         per-variable catch, not `Promise.all`'s all-or-nothing semantics;
//   (iv)  a resolved row's token cost is exactly `estimateTokens(row.text)`,
//         never a second, independent calculation.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveVariableLibraryRows: typeof import("@/lib/llmWorkspace/variableLibrary").resolveVariableLibraryRows;
let VARIABLE_REGISTRY: typeof import("@/lib/llmWorkspace/variables/registry").VARIABLE_REGISTRY;
let estimateTokens: typeof import("@/lib/llmWorkspace/tokenEstimate").estimateTokens;

let projectId: number;
let sequenceId: number;
let shotId: number;
let assetId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveVariableLibraryRows } = await import("@/lib/llmWorkspace/variableLibrary"));
  ({ VARIABLE_REGISTRY } = await import("@/lib/llmWorkspace/variables/registry"));
  ({ estimateTokens } = await import("@/lib/llmWorkspace/tokenEstimate"));

  projectId = await insertProject(ctx, "Variable library project");
  sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
  shotId = await insertShot(ctx, sequenceId, { title: "Shot" });
  assetId = await insertAsset(ctx, projectId, { name: "Asset", type: "character" });
});

afterAll(() => ctx.cleanup());

describe("resolveVariableLibraryRows — LLMW.VARLIB.1 (B6c2)", () => {
  it("(i) every variable of VARIABLE_REGISTRY appears, for a full selection — derived from the registry, not a hand-written list", async () => {
    const rows = await resolveVariableLibraryRows({ projectId, sequenceId, shotId, assetId });
    expect(rows.map((r) => r.id).sort()).toEqual(Object.keys(VARIABLE_REGISTRY).sort());
  });

  it("(i bis) with a full selection, every row resolves — none stays unresolved and none errors", async () => {
    const rows = await resolveVariableLibraryRows({ projectId, sequenceId, shotId, assetId });
    for (const row of rows) {
      // STYLE.LLM.LOOKFEEDBACK.CORE.1 — `LOOK.RESULT` anchors on `lookResult`,
      // and this selection carries no `lookResultId`: neither this page nor
      // the bench has a Look Result selector (no ticket in this chantier adds
      // one — see `.agents/executor_report.md`), so this "full" selection is
      // full for every entity this page can actually pick, but not for this
      // one. Staying honestly "unresolved" here — never a crash, never a
      // silently wrong id — is exactly the behaviour the ticket specifies.
      if (row.id === "LOOK.RESULT") {
        expect(row.status).toBe("unresolved");
        continue;
      }
      expect(row.status).toBe("resolved");
    }
  });

  it("(ii) anchor filtering — a project-only selection resolves every PROJECT.* row and leaves every SEQ.*/SHOT.*/ASSET.* row unresolved", async () => {
    const rows = await resolveVariableLibraryRows({ projectId });

    const projectRows = rows.filter((r) => r.anchor === "project");
    expect(projectRows.length).toBeGreaterThan(0);
    for (const row of projectRows) {
      expect(row.status).toBe("resolved");
    }

    const otherRows = rows.filter((r) => r.anchor !== "project");
    expect(otherRows.length).toBeGreaterThan(0);
    for (const row of otherRows) {
      expect(row.status).toBe("unresolved");
    }
  });

  it("(ii bis) with no selection at all, every row is unresolved — no error, no thrown exception", async () => {
    const rows = await resolveVariableLibraryRows({});
    expect(rows.length).toBe(Object.keys(VARIABLE_REGISTRY).length);
    for (const row of rows) {
      expect(row.status).toBe("unresolved");
    }
  });

  it("(iii) THE trap — a resolver that throws (a sequenceId pointing at nothing) leaves every other variable resolved", async () => {
    const rows = await resolveVariableLibraryRows({
      projectId,
      sequenceId: 999999,
      shotId,
      assetId,
    });

    const seqContextRow = rows.find((r) => r.id === "SEQ.CONTEXT");
    expect(seqContextRow?.status).toBe("error");
    if (seqContextRow?.status === "error") {
      expect(seqContextRow.message).toMatch(/sequence 999999 not found/);
    }

    // Every non-sequence-anchored variable is untouched by the sequence
    // resolver's own throw.
    const projectRows = rows.filter((r) => r.anchor === "project");
    for (const row of projectRows) {
      expect(row.status).toBe("resolved");
    }
    const assetRows = rows.filter((r) => r.anchor === "asset");
    for (const row of assetRows) {
      expect(row.status).toBe("resolved");
    }

    // `SHOT.CORE`/`SHOT.CURRENT_PROMPT`/etc are anchored on `shotId`, a real
    // shot — untouched by the broken sequenceId too, since
    // `anchorIdForEntity` reads them off `ids.shotId`, not `ids.sequenceId`.
    const shotRows = rows.filter((r) => r.anchor === "shot");
    for (const row of shotRows) {
      expect(row.status).toBe("resolved");
    }
  });

  it("(iv) a resolved row's token cost is exactly estimateTokens(row.text), not a second calculation", async () => {
    const rows = await resolveVariableLibraryRows({ projectId, sequenceId, shotId, assetId });
    for (const row of rows) {
      if (row.status !== "resolved") continue;
      expect(row.tokenEstimate).toBe(estimateTokens(row.text));
      expect(row.charCount).toBe(row.text.length);
    }
  });
});
