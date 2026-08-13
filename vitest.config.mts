import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `.mts` so Vite loads this as ESM. As a `.ts` file it was parsed as CommonJS,
// which Vite warns about and which breaks once `configLoader: 'native'` becomes
// the default. That also rules out `__dirname`, hence the URL-based resolution.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
