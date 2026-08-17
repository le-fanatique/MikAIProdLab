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
    // REPO.VITEST.DETERMINISM.1 — the heaviest DB-backed suites (asset
    // byte-equality proofs, tests/actions/bindings.test.ts) each spin up their
    // own temporary SQLite file. They pass in isolation and pass four at a
    // time, but fail unpredictably when all 89 files run in parallel on this
    // machine (observed both as thrown errors and as raw pass/fail count
    // drift across identical runs on a clean tree). This is a scheduling
    // problem, not a test content problem: capping worker concurrency removes
    // the contention that causes it. `poolOptions.threads.maxThreads` is not
    // part of Vitest 4's `InlineConfig` (TS2769); `maxWorkers` is the current
    // equivalent top-level option for the same "threads" pool.
    maxWorkers: 4,
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
