import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
// Plain .mjs, no type declarations — `allowJs`/`checkJs` (tsconfig.json)
// type-check it structurally anyway, including its JSDoc return types (see
// configTransportDefaultKeys.test.ts for the proof vitest can import it).
import {
  exportConfig,
  importConfig,
  validateConfigManifest,
  SECRET_APP_SETTINGS_KEYS,
} from "../../scripts/config-transport.mjs";

// ---------------------------------------------------------------------------
// DEVOPS.CONFIG.EXPORT.1. Characterization + behavior tests for the
// export/import of app_settings, comfy_workflows and llm_templates —
// deliberately never projects/sequences/shots/assets/media (docs/
// DEVOPS_LINUX_PORT_1_AUDIT.md §4). The real bug this ticket exists to
// prevent — a naive autoIncrement import silently pointing the six
// default_workflow_* settings at the wrong workflow — is exercised directly
// by the "case 2" tests below.
// ---------------------------------------------------------------------------

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    try {
      fn?.();
    } catch {
      // best-effort
    }
  }
});

function makeTempRoot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Runs drizzle's migrator against a fresh file, then closes the handle so the test can reopen it with a plain better-sqlite3 connection. */
function migrateFreshDb(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new Database(dbPath);
  const orm = drizzle(raw);
  migrate(orm, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  raw.close();
}

const NOW = "2026-01-01T00:00:00.000Z";

function insertWorkflow(
  raw: Database.Database,
  overrides: Partial<{
    id: number;
    name: string;
    kind: string;
    thumbnail_path: string | null;
    thumbnail_source_filename: string | null;
  }>
): void {
  raw
    .prepare(
      `INSERT INTO comfy_workflows
       (id, name, kind, description, workflow_json, source_filename, created_at, updated_at, category, tags, contexts, thumbnail_path, thumbnail_source_filename, status, is_favorite)
       VALUES (@id, @name, @kind, NULL, '{}', NULL, @created_at, @updated_at, NULL, NULL, NULL, @thumbnail_path, @thumbnail_source_filename, 'active', 0)`
    )
    .run({
      id: overrides.id,
      name: overrides.name ?? `Workflow ${overrides.id}`,
      kind: overrides.kind ?? "image",
      created_at: NOW,
      updated_at: NOW,
      thumbnail_path: overrides.thumbnail_path ?? null,
      thumbnail_source_filename: overrides.thumbnail_source_filename ?? null,
    });
}

/** Seeds a source-shaped fixture: the four workflows the six defaults point to (ids deliberately non-contiguous, mirroring the real "holed" id sequence the ticket's §2 measured), the six defaults, two secrets, one ordinary setting, and one project-linked template. */
function seedSource(dbPath: string): void {
  const raw = new Database(dbPath);
  try {
    raw.exec(`INSERT INTO projects (id, name, status) VALUES (1, 'Fixture Project', 'draft')`);

    insertWorkflow(raw, { id: 15, name: "Asset/Shot image default" });
    insertWorkflow(raw, { id: 22, name: "Gaussian PLY default" });
    insertWorkflow(raw, { id: 23, name: "Gaussian-to-image default" });
    insertWorkflow(raw, { id: 51, name: "Shot video default", kind: "video" });

    const setting = raw.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`);
    setting.run("default_workflow_asset_image", "15");
    setting.run("default_workflow_shot_image", "15");
    setting.run("default_workflow_shot_video", "51");
    setting.run("default_workflow_gaussian_ply", "22");
    setting.run("default_workflow_gaussian_to_image", "23");
    setting.run("default_workflow_look_development", "15");
    setting.run("comfyui_api_key", "sk-comfy-secret");
    setting.run("llm_api_key", "sk-llm-secret");
    setting.run("llm_ollama_api_key", "sk-ollama-secret");
    setting.run("comfyui_base_url", "http://127.0.0.1:8188");

    raw
      .prepare(
        `INSERT INTO llm_templates (id, name, description, anchor_kind, project_id, template_json, source_filename, created_at, updated_at)
         VALUES (1, 'Fixture template', NULL, 'project', 1, '{}', NULL, ?, ?)`
      )
      .run(NOW, NOW);
  } finally {
    raw.close();
  }
}

function fakeRun() {
  const calls: Array<{ cmd: string; args: string[]; opts: unknown }> = [];
  const run = (cmd: string, args: string[], opts: unknown) => {
    calls.push({ cmd, args, opts });
    return { status: 0, stdout: "", stderr: "", error: undefined };
  };
  return { run, calls };
}

/** Narrows a `{ ok: boolean, ... }` result to its `ok: true` variant, failing the test loudly (via `expect`) rather than throwing a bare TypeError if it is not. */
function assertOk<T extends { ok: boolean }>(result: T): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable — the expectation above already failed the test");
}

function readRows(dbPath: string, sql: string): unknown[] {
  const raw = new Database(dbPath, { readonly: true });
  try {
    return raw.prepare(sql).all();
  } finally {
    raw.close();
  }
}

// ---------------------------------------------------------------------------
// C1 — secrets
// ---------------------------------------------------------------------------

describe("exportConfig — secrets", () => {
  it("omits every present secret key by default (including a provider-derived one) and names them as omitted", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const dbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(dbPath);
    seedSource(dbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");

    const result = await exportConfig({ sourceRoot, dbPath, outputRoot });
    assertOk(result);

    const keys = result.manifest.appSettings.map((r: { key: string }) => r.key);
    for (const secretKey of SECRET_APP_SETTINGS_KEYS) {
      expect(keys).not.toContain(secretKey);
    }
    // The fixture only fills three of the six known secret keys — omitted
    // must name exactly those three, not invent the other three that were
    // never rows in the first place.
    expect(result.manifest.omittedSecretKeys.sort()).toEqual(["comfyui_api_key", "llm_api_key", "llm_ollama_api_key"]);
    expect(keys).toContain("comfyui_base_url");
  });

  it("includes secrets when --with-secrets is set, and reports nothing omitted", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const dbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(dbPath);
    seedSource(dbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");

    const result = await exportConfig({ sourceRoot, dbPath, outputRoot, withSecrets: true });
    assertOk(result);
    const keys = result.manifest.appSettings.map((r: { key: string }) => r.key);
    expect(keys).toContain("comfyui_api_key");
    expect(keys).toContain("llm_api_key");
    expect(keys).toContain("llm_ollama_api_key");
    expect(result.manifest.omittedSecretKeys).toEqual([]);
  });

  it("never writes to the source database", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const dbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(dbPath);
    seedSource(dbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");

    const before = readRows(dbPath, "SELECT * FROM comfy_workflows ORDER BY id");
    await exportConfig({ sourceRoot, dbPath, outputRoot });
    const after = readRows(dbPath, "SELECT * FROM comfy_workflows ORDER BY id");
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// C3 — import, case 1 (empty target: ids preserved)
// ---------------------------------------------------------------------------

describe("importConfig — case 1: empty target comfy_workflows", () => {
  async function setupExport() {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const dbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(dbPath);
    seedSource(dbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const result = await exportConfig({ sourceRoot, dbPath, outputRoot });
    if (!result.ok) throw new Error(result.reason);
    return result.exportDir as string;
  }

  it("preserves original workflow ids, and the six defaults stay valid without rewriting", async () => {
    const exportDir = await setupExport();
    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    migrateFreshDb(path.join(targetRoot, "data", "mikailab.db"));
    const { run } = fakeRun();

    const result = await importConfig({ importDir: exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.preserveWorkflowIds).toBe(true);

    const dbPath = path.join(targetRoot, "data", "mikailab.db");
    const ids = (readRows(dbPath, "SELECT id FROM comfy_workflows ORDER BY id") as { id: number }[]).map((r) => r.id);
    expect(ids).toEqual([15, 22, 23, 51]);

    const settings = new Map(
      (readRows(dbPath, "SELECT key, value FROM app_settings") as { key: string; value: string }[]).map((r) => [r.key, r.value])
    );
    expect(settings.get("default_workflow_asset_image")).toBe("15");
    expect(settings.get("default_workflow_shot_video")).toBe("51");
    expect(settings.get("default_workflow_gaussian_ply")).toBe("22");
    expect(settings.get("default_workflow_gaussian_to_image")).toBe("23");
    expect(settings.get("default_workflow_look_development")).toBe("15");
  });

  it("requires a backup before writing to the (already-migrated) target DB", async () => {
    const exportDir = await setupExport();
    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    migrateFreshDb(path.join(targetRoot, "data", "mikailab.db"));
    const { run, calls } = fakeRun();

    const result = await importConfig({ importDir: exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.backup.ran).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["run", "backup:create"]);
  });
});

// ---------------------------------------------------------------------------
// C3 — import, case 2 (non-empty target: ids remapped, defaults rewritten)
// ---------------------------------------------------------------------------

describe("importConfig — case 2: target already has comfy_workflows", () => {
  it("assigns new ids and rewrites the six defaults through the id map", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const srcDbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(srcDbPath);
    seedSource(srcDbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const exportResult = await exportConfig({ sourceRoot, dbPath: srcDbPath, outputRoot });
    if (!exportResult.ok) throw new Error(exportResult.reason);

    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    const targetDbPath = path.join(targetRoot, "data", "mikailab.db");
    migrateFreshDb(targetDbPath);
    // Pre-existing workflow on the target — this is what makes it "case 2".
    const targetRaw = new Database(targetDbPath);
    insertWorkflow(targetRaw, { id: 1, name: "Already on target" });
    targetRaw.close();

    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportResult.exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.preserveWorkflowIds).toBe(false);

    const rows = readRows(targetDbPath, "SELECT id, name FROM comfy_workflows ORDER BY id") as { id: number; name: string }[];
    // 5 rows total: the pre-existing one plus the 4 imported ones, none
    // colliding with id 1.
    expect(rows).toHaveLength(5);
    const byName = new Map(rows.map((r) => [r.name, r.id]));
    const shotVideoNewId = byName.get("Shot video default");
    const gaussianPlyNewId = byName.get("Gaussian PLY default");
    const gaussianToImageNewId = byName.get("Gaussian-to-image default");
    const assetImageNewId = byName.get("Asset/Shot image default");
    expect(shotVideoNewId).not.toBe(51); // proves it was actually remapped, not coincidentally preserved
    expect(assetImageNewId).not.toBe(1);

    const settings = new Map(
      (readRows(targetDbPath, "SELECT key, value FROM app_settings") as { key: string; value: string }[]).map((r) => [r.key, r.value])
    );
    expect(settings.get("default_workflow_shot_video")).toBe(String(shotVideoNewId));
    expect(settings.get("default_workflow_gaussian_ply")).toBe(String(gaussianPlyNewId));
    expect(settings.get("default_workflow_gaussian_to_image")).toBe(String(gaussianToImageNewId));
    expect(settings.get("default_workflow_asset_image")).toBe(String(assetImageNewId));
    expect(settings.get("default_workflow_look_development")).toBe(String(assetImageNewId));
  });

  it("omits (never invents) a default whose source workflow was not imported", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const srcDbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(srcDbPath);
    const raw = new Database(srcDbPath);
    // Only the workflow id 15 exists; the default points at a workflow (999)
    // that is not among the exported rows.
    insertWorkflow(raw, { id: 15, name: "Only workflow" });
    raw.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`).run("default_workflow_asset_image", "999");
    raw.close();
    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const exportResult = await exportConfig({ sourceRoot, dbPath: srcDbPath, outputRoot });
    if (!exportResult.ok) throw new Error(exportResult.reason);
    // Simulate export having actually carried only workflow 15 (999 never existed to export).
    expect(exportResult.manifest.comfyWorkflows.map((w: { id: number }) => w.id)).toEqual([15]);

    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    const targetDbPath = path.join(targetRoot, "data", "mikailab.db");
    migrateFreshDb(targetDbPath);
    const targetRaw = new Database(targetDbPath);
    insertWorkflow(targetRaw, { id: 1, name: "Pre-existing" }); // forces case 2
    targetRaw.close();

    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportResult.exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.omittedDefaultWorkflowKeys).toEqual(["default_workflow_asset_image"]);

    const settings = readRows(targetDbPath, "SELECT key FROM app_settings WHERE key = 'default_workflow_asset_image'");
    expect(settings).toEqual([]); // never written, not written as null/garbage either
  });
});

// ---------------------------------------------------------------------------
// app_settings collision policy
// ---------------------------------------------------------------------------

describe("importConfig — an app_settings key already present on the target", () => {
  async function setup() {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const srcDbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(srcDbPath);
    seedSource(srcDbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const exportResult = await exportConfig({ sourceRoot, dbPath: srcDbPath, outputRoot });
    if (!exportResult.ok) throw new Error(exportResult.reason);

    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    const targetDbPath = path.join(targetRoot, "data", "mikailab.db");
    migrateFreshDb(targetDbPath);
    const targetRaw = new Database(targetDbPath);
    targetRaw.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`).run("comfyui_base_url", "http://existing-target:8188");
    targetRaw.close();

    return { exportDir: exportResult.exportDir as string, targetRoot, targetDbPath };
  }

  it("is kept as-is by default, and reported as skipped", async () => {
    const { exportDir, targetRoot, targetDbPath } = await setup();
    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.skippedExistingAppSettingsKeys).toContain("comfyui_base_url");
    const row = (readRows(targetDbPath, "SELECT value FROM app_settings WHERE key = 'comfyui_base_url'") as { value: string }[])[0];
    expect(row.value).toBe("http://existing-target:8188");
  });

  it("is overwritten when --overwrite-app-settings is passed", async () => {
    const { exportDir, targetRoot, targetDbPath } = await setup();
    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportDir, targetRoot, overwriteAppSettings: true, run, env: {} });
    assertOk(result);
    expect(result.skippedExistingAppSettingsKeys).not.toContain("comfyui_base_url");
    const row = (readRows(targetDbPath, "SELECT value FROM app_settings WHERE key = 'comfyui_base_url'") as { value: string }[])[0];
    expect(row.value).toBe("http://127.0.0.1:8188");
  });
});

// ---------------------------------------------------------------------------
// llm_templates — always unlinked from projects
// ---------------------------------------------------------------------------

describe("importConfig — llm_templates.project_id", () => {
  it("is always set to NULL on the target, and counted as unlinked", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const srcDbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(srcDbPath);
    seedSource(srcDbPath);
    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const exportResult = await exportConfig({ sourceRoot, dbPath: srcDbPath, outputRoot });
    if (!exportResult.ok) throw new Error(exportResult.reason);
    expect(exportResult.manifest.llmTemplates[0].project_id).toBe(1); // sanity: the source really had a linked template

    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    migrateFreshDb(path.join(targetRoot, "data", "mikailab.db"));
    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportResult.exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.templatesUnlinked).toBe(1);

    const row = (
      readRows(path.join(targetRoot, "data", "mikailab.db"), "SELECT project_id FROM llm_templates") as { project_id: number | null }[]
    )[0];
    expect(row.project_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C2/C3 — thumbnail integrity
// ---------------------------------------------------------------------------

describe("thumbnail handling", () => {
  function writeFakeThumbnail(sourceRoot: string): string {
    const relDir = path.join("public", "uploads", "reference-images", "workflow-thumbnails");
    mkdirSync(path.join(sourceRoot, relDir), { recursive: true });
    const relPath = "uploads/reference-images/workflow-thumbnails/fixture-thumb.png";
    writeFileSync(path.join(sourceRoot, "public", ...relPath.split("/")), Buffer.from("fake-png-bytes"));
    return relPath;
  }

  it("carries a valid thumbnail through export and import, sha256 intact", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const dbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(dbPath);
    const thumbRelPath = writeFakeThumbnail(sourceRoot);
    const raw = new Database(dbPath);
    insertWorkflow(raw, { id: 7, name: "Thumbnail workflow", thumbnail_path: thumbRelPath, thumbnail_source_filename: "original.png" });
    raw.close();

    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const exportResult = await exportConfig({ sourceRoot, dbPath, outputRoot });
    if (!exportResult.ok) throw new Error(exportResult.reason);
    expect(exportResult.manifest.thumbnails).toHaveLength(1);

    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    migrateFreshDb(path.join(targetRoot, "data", "mikailab.db"));
    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportResult.exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.writtenThumbnailCount).toBe(1);
    expect(result.droppedThumbnails).toEqual([]);

    const row = (
      readRows(path.join(targetRoot, "data", "mikailab.db"), "SELECT thumbnail_path FROM comfy_workflows WHERE id = 7") as {
        thumbnail_path: string | null;
      }[]
    )[0];
    // Case 1 (empty target) preserves the id, so the row is still id 7.
    expect(row.thumbnail_path).toBe(thumbRelPath);
  });

  it("drops a thumbnail whose sha256 no longer matches, and nulls thumbnail_path instead of failing the import", async () => {
    const sourceRoot = makeTempRoot("mikai-cfg-src-");
    const dbPath = path.join(sourceRoot, "mikailab.db");
    migrateFreshDb(dbPath);
    const thumbRelPath = writeFakeThumbnail(sourceRoot);
    const raw = new Database(dbPath);
    insertWorkflow(raw, { id: 7, name: "Thumbnail workflow", thumbnail_path: thumbRelPath });
    raw.close();

    const outputRoot = makeTempRoot("mikai-cfg-out-");
    const exportResult = await exportConfig({ sourceRoot, dbPath, outputRoot });
    if (!exportResult.ok) throw new Error(exportResult.reason);

    // Corrupt the exported thumbnail file after export, before import — the
    // manifest's recorded sha256 no longer matches what is on disk.
    const exportedFile = path.join(exportResult.exportDir, "thumbnails", "fixture-thumb.png");
    writeFileSync(exportedFile, Buffer.from("tampered-bytes"));

    const targetRoot = makeTempRoot("mikai-cfg-tgt-");
    migrateFreshDb(path.join(targetRoot, "data", "mikailab.db"));
    const { run } = fakeRun();
    const result = await importConfig({ importDir: exportResult.exportDir, targetRoot, run, env: {} });
    assertOk(result);
    expect(result.writtenThumbnailCount).toBe(0);
    expect(result.droppedThumbnails).toHaveLength(1);
    expect(result.droppedThumbnails[0].reason).toMatch(/sha256/);

    const row = (
      readRows(path.join(targetRoot, "data", "mikailab.db"), "SELECT thumbnail_path FROM comfy_workflows WHERE id = 7") as {
        thumbnail_path: string | null;
      }[]
    )[0];
    expect(row.thumbnail_path).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

describe("validateConfigManifest", () => {
  it("rejects an unknown formatVersion", () => {
    const errors = validateConfigManifest({
      formatVersion: 999,
      createdAt: NOW,
      appSettings: [],
      omittedSecretKeys: [],
      comfyWorkflows: [],
      llmTemplates: [],
      thumbnails: [],
    });
    expect(errors.some((e: string) => e.includes("formatVersion"))).toBe(true);
  });

  it("accepts a minimal, well-formed manifest", () => {
    const errors = validateConfigManifest({
      formatVersion: 1,
      createdAt: NOW,
      appSettings: [{ key: "a", value: "b" }],
      omittedSecretKeys: [],
      comfyWorkflows: [],
      llmTemplates: [],
      thumbnails: [],
    });
    expect(errors).toEqual([]);
  });
});
