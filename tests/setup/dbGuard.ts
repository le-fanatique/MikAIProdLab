import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Runs before any test module is loaded, in every Vitest worker.
 *
 * `src/db/index.ts` binds one `better-sqlite3` handle at module load from
 * `DB_PATH`, falling back to `<cwd>/data/mikailab.db` — the real development
 * database. A single stray top-level `import` that reaches `@/db` before a
 * test can redirect `DB_PATH` therefore writes to production data. That is not
 * hypothetical: it happened once, and two fixture rows had to be deleted from
 * the development database by hand.
 *
 * The fix is to make the default harmless rather than to rely on every test
 * file being written correctly. `DB_PATH` is pointed at a throwaway file
 * before anything can read it, so the worst case for a badly ordered import is
 * an empty, unmigrated temporary database — a loud failure inside the test,
 * never a silent write to `data/`.
 *
 * `setupTempDb()` still overrides `DB_PATH` with its own per-file path; this
 * only guarantees the floor.
 */

// Nothing is created here: this only names a path. `src/db/index.ts` creates
// the file and its directory if — and only if — something actually loads
// `@/db` outside the harness. A `mikai-vitest-guard` directory appearing in
// the temporary folder is therefore a signal that a test file imports the
// database too early, not routine residue.
process.env.DB_PATH = path.join(
  tmpdir(),
  "mikai-vitest-guard",
  `worker-${process.pid}.db`
);
