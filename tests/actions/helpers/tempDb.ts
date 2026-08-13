import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Disposable-database harness for the Approve-side write actions.
 *
 * `src/db/index.ts` binds a single `better-sqlite3` handle at module load from
 * `DB_PATH`. `DB_PATH` must therefore be set before the first import of `@/db`
 * — and before any import of an action module, which imports `@/db` in turn.
 * That is why every consumer of this harness imports dynamically, after
 * `setupTempDb()` has returned.
 *
 * Vitest parallelises by file and the handle is a load-time singleton, so each
 * test file gets its own temporary directory rather than sharing one database.
 */

type DbModule = typeof import("@/db");
type SchemaModule = typeof import("@/db/schema");

export type TempDb = {
  db: DbModule["db"];
  schema: SchemaModule;
  cleanup: () => void;
};

export async function setupTempDb(): Promise<TempDb> {
  const dir = mkdtempSync(path.join(tmpdir(), "mikai-actions-"));
  process.env.DB_PATH = path.join(dir, "test.db");

  let opened: DbModule["db"] | undefined;

  try {
    const { db } = await import("@/db");
    opened = db;
    const schema = await import("@/db/schema");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");

    migrate(db, { migrationsFolder: "drizzle" });

    return {
      db,
      schema,
      cleanup: () => {
        // Close before removing: Windows keeps the .db/.db-wal files locked
        // while the handle is open, which would leave residue behind the suite.
        closeHandle(db);
        rmSync(dir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    // A failed migration must not leave a temporary directory behind: the
    // caller never receives a `cleanup` it could run. The handle may already
    // be open on the file, so release it before removing the directory.
    if (opened) closeHandle(opened);
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function closeHandle(db: DbModule["db"]): void {
  const client = (db as unknown as { $client?: { close: () => void } }).$client;
  try {
    client?.close();
  } catch {
    // Already closed — nothing to release.
  }
}

/**
 * Runs an action that answers with `redirect()` and returns the redirect
 * target. `redirect()` throws; its `digest` carries the full URL, which is the
 * only observable contract of the `FormData` actions on both the success and
 * the error path.
 */
export async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      // NEXT_REDIRECT;replace;<url>;307;
      return digest.split(";")[2];
    }
    throw err;
  }
  throw new Error("Expected the action to redirect, but it returned normally.");
}

/** Column names whose value differs between two snapshots of the same row. */
export function changedColumns(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]).sort();
}
