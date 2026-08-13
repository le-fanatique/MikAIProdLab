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
