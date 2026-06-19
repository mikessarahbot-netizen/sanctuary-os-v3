import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@sanctuary-os/web` tests.
 *
 * Most files are jsdom component tests (React Testing Library) under the global
 * `jsdom` environment. The end-to-end CONTRACT tests under `src/e2e/**` opt into
 * the `node` environment per-file (`// @vitest-environment node`) because they
 * boot a real http server. Named `.mts` so it stays outside the repo's TypeScript
 * lint/typecheck globs while Vitest still auto-loads it (mirrors the api package
 * convention).
 *
 * `server.deps.inline` pulls the DEV-ONLY `@sanctuary-os/api` workspace package
 * (whose `exports` point at `.ts` source) into Vite's transform + resolution
 * graph so its transitive deps (e.g. `graphql`) resolve under the web tree. This
 * is test-harness wiring only — `@sanctuary-os/api` is a devDependency and never
 * enters the production `vite build` bundle (the web app code does not import it).
 */
export default defineConfig({
  plugins: [react()],
  // `graphql` enforces a single-module-instance invariant (its `instanceOf`
  // checks reject a schema built by a different copy). The inlined api source and
  // the e2e harness must therefore share ONE `graphql` instance — dedupe it.
  resolve: {
    dedupe: ["graphql"]
  },
  test: {
    css: false,
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        inline: [/@sanctuary-os\/api/, /^graphql$/, /@graphql-tools\//]
      }
    },
    setupFiles: ["./vitest.setup.ts"]
  }
});
