import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `.mts` so Vite loads this as ESM. As a `.ts` file it was parsed as CommonJS,
// which Vite warns about and which breaks once `configLoader: 'native'` becomes
// the default. That also rules out `__dirname`, hence the URL-based resolution.
export default defineConfig({
  test: {
    environment: "node",
    // Points DB_PATH at a throwaway file before any test module loads, so a
    // mis-ordered import can never reach the development database.
    setupFiles: ["./tests/setup/dbGuard.ts"],
    // REPO.VITEST.DETERMINISM.1 (716fc55, 2026-08-18) capped this at 4: the
    // heaviest DB-backed suites (asset byte-equality proofs,
    // tests/actions/bindings.test.ts) passed in isolation and four at a time,
    // but failed unpredictably when all 89 files ran in parallel on this
    // machine — both as thrown errors and as raw pass/fail count drift across
    // identical runs on a clean tree. Its comment named the "threads" pool,
    // but no `pool` was ever configured here; Vitest 4's default pool is
    // `forks` (child processes), and this repository has never run threads.
    // REPO.VITEST.WORKERS.1 (2026-08-28) tried to reproduce that failure: 13
    // consecutive full runs at 48 workers on this same machine, 196/196
    // files and 2001/2001 tests every time, no drift, no thrown error. Each
    // test file already gets its own temporary SQLite database
    // (tests/actions/helpers/tempDb.ts, mkdtempSync) with no file shared
    // between workers, so the classic SQLITE_BUSY contention this cap was
    // meant to remove cannot occur through that path either way. The
    // reproduction failing after 13 runs does not prove the failure is gone —
    // `npm run test:repeat 30` (scripts/test-repeat.mjs) is how to reopen
    // this question: it repeats the suite N times and treats any run whose
    // pass/fail totals differ from the previous run as an anomaly, the exact
    // signal 716fc55 described.
    //
    // A percentage, not a fixed number: Vitest computes it from
    // `os.availableParallelism`, so it stays proportionate on a 4-core laptop
    // and on this 48-core machine alike. `poolOptions.threads.maxThreads` is
    // not part of Vitest 4's `InlineConfig` (TS2769); `maxWorkers` is the
    // current top-level option for the configured pool, `forks` included.
    maxWorkers: "75%",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js aliases "server-only" at build time; Vitest runs under plain
      // Node and has no such package installed, so stub it for tests only.
      "server-only": fileURLToPath(
        new URL("./tests/helpers/serverOnlyStub.ts", import.meta.url)
      ),
    },
  },
});
