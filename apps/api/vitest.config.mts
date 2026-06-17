import { defineConfig } from "vitest/config";

/**
 * Force a single `graphql` module instance under Vitest.
 *
 * `graphql` ships both CJS and ESM entry points; without deduping, the schema
 * built by `@graphql-tools/schema` and the `graphql()` executor can resolve to
 * different copies, which fails graphql's cross-realm `instanceof` checks
 * ("Cannot use GraphQLSchema from another module or realm"). Deduping and
 * inlining the GraphQL tools keeps them on one instance.
 *
 * Named `.mts` so it stays outside the TypeScript lint/typecheck globs while
 * Vitest still auto-loads it.
 */
export default defineConfig({
  resolve: {
    dedupe: ["graphql"]
  },
  test: {
    server: {
      deps: {
        inline: ["graphql", /@graphql-tools\//]
      }
    }
  }
});
