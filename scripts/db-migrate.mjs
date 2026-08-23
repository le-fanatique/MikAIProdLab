#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Custom `db:migrate` (DB.MIGRATE.1) — replaces `drizzle-kit migrate`.
//
// `drizzle-kit migrate` wraps every pending SQLite migration in a single
// transaction. SQLite treats `PRAGMA foreign_keys` as a no-op once a
// transaction is open, and this repo's better-sqlite3 connection enables
// foreign keys by default — so a migration that reconstructs a table
// (drizzle-kit's own DROP + rename pattern for a column change SQLite
// cannot ALTER) fails with `FOREIGN KEY constraint failed` on any row that
// still references it, deep inside a transaction the whole batch then rolls
// back. `drizzle-kit migrate` reports none of this: it exits 1, silently.
//
// `PRAGMA foreign_keys=OFF` in the generated SQL cannot fix this (SQLite
// ignores it inside a transaction, wherever it is placed), nor can splitting
// migrations one table per file, nor `PRAGMA defer_foreign_keys=ON` (the
// deferred-violation counter the DROP increments is never decremented by the
// RENAME that follows it, so the COMMIT itself then fails).
//
// The one fix that works: turn foreign keys off on the connection BEFORE the
// migrator ever opens its transaction. That is unsafe on its own — it is
// exactly the enforcement a reconstruction needs — so this script always
// pairs it with an explicit PRAGMA foreign_key_check and PRAGMA
// integrity_check afterward, and fails loudly if either reports a problem.
//
// This script never creates a backup and never decides to run against the
// real database — `backup:create` and that decision both belong to the
// operator, always before invoking this script.
// ---------------------------------------------------------------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const MIGRATIONS_FOLDER = "./drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Resolves the database path exactly as drizzle.config.ts does — the same
 * env var, the same default, the same path.resolve. Do not duplicate this
 * default anywhere else; import this instead.
 */
export function resolveDbPath(env = process.env) {
  return path.resolve(env.DB_PATH ?? "./data/mikailab.db");
}

function formatPragmaRows(rows) {
  return rows.map((r) => JSON.stringify(r)).join("\n  ");
}

/**
 * Thrown only for foreign_key_check / integrity_check failures — both run
 * strictly after the migrator has already committed its own transaction. A
 * failure here means the database WAS migrated and is left exactly as
 * checked; that is the opposite situation from migrate() itself throwing
 * (its transaction rolls back, so nothing was committed). main() reads this
 * flag to tell an operator the true state of the database rather than a
 * generic "rolled back" line that is true for one failure path and false
 * for the other two.
 */
class PostCommitCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = "PostCommitCheckError";
    this.migrationCommitted = true;
  }
}

function countAppliedMigrations(sqlite) {
  const tableExists = sqlite
    .prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(MIGRATIONS_TABLE).c;
  if (tableExists === 0) return 0;
  return sqlite.prepare(`SELECT COUNT(*) c FROM ${MIGRATIONS_TABLE}`).get().c;
}

/**
 * Applies every pending migration in `./drizzle` to the database at
 * `dbPath`, with foreign key enforcement turned off on the connection for
 * the duration of the migrator's transaction, and turned back on plus
 * verified (foreign_key_check, integrity_check) immediately after.
 *
 * Throws on any failure — a failed migrator call, a foreign key violation,
 * or a failed integrity check — with the real underlying message. Never
 * swallows an error into a bare non-zero exit.
 */
export async function runMigration(dbPath) {
  const sqlite = new Database(dbPath);
  try {
    const appliedBefore = countAppliedMigrations(sqlite);

    // The core of the fix: this must happen before the migrator opens its
    // transaction, on this same connection. Setting it inside a migration's
    // SQL, or before a transaction the migrator opens itself, has no effect.
    sqlite.pragma("foreign_keys = OFF");

    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    sqlite.pragma("foreign_keys = ON");

    // The mandatory counterpart of having skipped enforcement during the
    // migration: nothing that was left unchecked above may go unverified.
    const fkViolations = sqlite.pragma("foreign_key_check");
    if (fkViolations.length > 0) {
      throw new PostCommitCheckError(
        `foreign_key_check found ${fkViolations.length} violation(s) after migration — the database was left in this state, review before retrying:\n  ${formatPragmaRows(fkViolations)}`
      );
    }

    const integrity = sqlite.pragma("integrity_check");
    const integrityOk = integrity.length === 1 && integrity[0].integrity_check === "ok";
    if (!integrityOk) {
      throw new PostCommitCheckError(`integrity_check did not return ok:\n  ${formatPragmaRows(integrity)}`);
    }

    const appliedAfter = countAppliedMigrations(sqlite);
    return { appliedCount: appliedAfter - appliedBefore };
  } finally {
    sqlite.close();
  }
}

async function main() {
  const dbPath = resolveDbPath();
  console.log(`[db-migrate] database: ${dbPath}`);
  console.log(`[db-migrate] migrations folder: ${MIGRATIONS_FOLDER}`);

  let result;
  try {
    result = await runMigration(dbPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db-migrate] failed: ${message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    if (err instanceof PostCommitCheckError) {
      console.error(
        "[db-migrate] the migration itself already committed before this check ran — the database WAS migrated, and is left exactly as reported above. This is not a rollback."
      );
    } else {
      console.error(
        "[db-migrate] the migrator's own transaction rolled back on failure, so this database was not left mid-migration by this run."
      );
    }
    console.error(
      "[db-migrate] before retrying against a real database, take a backup with `npm run backup:create` and verify it with `npm run backup:verify`."
    );
    process.exitCode = 1;
    return;
  }

  if (result.appliedCount === 0) {
    console.log("[db-migrate] already up to date — nothing applied.");
  } else {
    console.log(`[db-migrate] applied ${result.appliedCount} migration(s).`);
  }
}

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
