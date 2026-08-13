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
  const dbFile = path.join(dir, "test.db");
  process.env.DB_PATH = dbFile;

  let opened: DbModule["db"] | undefined;

  try {
    const { db } = await import("@/db");
    opened = db;
    assertBoundToThisFile(db, dbFile);
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
 * `src/db/index.ts` binds its `better-sqlite3` handle at first import from
 * `DB_PATH`. If some earlier static `import` reached `@/db` (directly or
 * transitively) before this function set `DB_PATH`, the handle imported
 * above is not a new one bound to `dbFile` — it is the module-scope
 * singleton, already bound to whatever `DB_PATH` was in effect at that
 * earlier import (the global `tests/setup/dbGuard.ts` floor, or worse, the
 * real `data/mikailab.db` if the guard itself had not run yet). That defeats
 * per-file isolation silently: the test still runs, against the wrong
 * database, and two test files sharing that same earlier-bound handle would
 * corrupt each other's fixtures without either failing loudly.
 *
 * `better-sqlite3` exposes the file it opened via `$client.name` (drizzle's
 * `$client` is the underlying `Database` instance). Comparing it against the
 * file this call just named turns that silent failure into an explicit one,
 * naming the likely cause so the fix is a one-line search rather than a
 * repeat of the incident `dbGuard.ts` already documents.
 */
function assertBoundToThisFile(db: DbModule["db"], expectedFile: string): void {
  const client = (db as unknown as { $client?: { name?: string } }).$client;
  const actual = client?.name;
  const expected = path.resolve(expectedFile);
  if (actual !== expected) {
    throw new Error(
      `setupTempDb(): "@/db" is bound to "${actual ?? "(unknown)"}", not the file this call just named ` +
        `("${expected}"). This means something imported "@/db" — directly or transitively — before ` +
        `setupTempDb() ran, at module load time, so DB_PATH was already stale when the handle bound. ` +
        `Search the test file (and any module it imports statically) for a top-level import that reaches ` +
        `"@/db"; it must become a dynamic import inside a function body instead.`
    );
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
