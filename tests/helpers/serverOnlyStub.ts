// Empty stub aliased to the bare specifier "server-only" in vitest.config.mts.
//
// The real `server-only` package is not installed in this repository — it
// only exists to make Next.js's own bundler (webpack/Turbopack) fail the
// *build* when a server-only module is imported from a client component.
// That guarantee is a build-time concern; it has nothing to do with Vitest,
// which runs under plain Node. Without this alias, any test that transitively
// imports a module starting with `import "server-only";` (e.g.
// `src/lib/llm/index.ts`) fails to load with `MODULE_NOT_FOUND`, even though
// the code under test has no client/server boundary problem at all.
//
// This file intentionally does nothing: aliasing "server-only" to an empty
// module reproduces exactly what happens at build time (the import is a
// side-effect-only marker with no runtime export), without installing the
// package or touching src/.
export {};
