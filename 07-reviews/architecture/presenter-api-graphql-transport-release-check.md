# API Presenter GraphQL Schema + Transport Handler Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `4db0fb8`

## Result

Pass with follow-ups. The slice stands up the API's GraphQL execution layer, which previously did not exist (the API had SDL strings + resolver objects but no engine). It adds `graphql` + `@graphql-tools/schema`, assembles the executable Presenter schema (base root types, `JSON`/`DateTime` scalars, presenter resolvers), and a transport-agnostic request handler that resolves the actor from the `Authorization` header via the injected `AuthBoundary`, conveys `requestId` from the idempotency header (generating one if absent), executes the schema, and redacts resolver error text while preserving `extensions.code`. No concrete Node `http` listener is bound, and the desktop conventions (bearer auth, `x-request-id`, conflict codes) are honored. The conflict-code error mapping is deferred because the services lack typed domain errors.

## Scope Reviewed

- `apps/api/src/graphql/presenter-schema.ts` + `transport.ts` + `transport.test.ts`
- `apps/api/src/graphql/presenter.ts` (resolvers, context, SDL)
- `apps/api/src/auth/index.ts` (`AuthBoundary`)
- `apps/api/vitest.config.mts`
- `apps/api/package.json` (graphql deps)

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Executable schema | Pass | `createPresenterGraphqlSchema` merges base root `Query`/`Mutation` + `JSON` scalar with the presenter SDL (which provides `DateTime`), avoiding duplicate scalar definitions, and binds the presenter resolvers + pass-through scalar resolvers via `makeExecutableSchema`. |
| Transport-agnostic handler | Pass | `createPresenterGraphqlRequestHandler` takes `{ headers, body }` and returns `{ status, body }`; no `http`/framework listener is bound, so a thin server binding can be added separately. |
| Actor resolution | Pass | The handler reads the (case-insensitive) `Authorization` header and resolves the actor via the injected `AuthBoundary`; missing header → 401 `AUTHENTICATION_REQUIRED`, resolve failure → 401 `AUTHENTICATION_FAILED`. Two tests cover these. |
| Idempotency conveyance | Pass | `requestId` is taken from the `x-request-id` header (override-able) and generated when absent; tests prove both passthrough and generation reach the service via the GraphQL context. |
| Schema execution | Pass | A mutation and a query both execute through the handler against the real schema with fake services; the mutation returns `{ data: { updatePresentation: { presentationId } } }`. |
| Error redaction | Pass | Resolver/internal errors (those with an `originalError`) are redacted to a generic message; validation/syntax errors are surfaced; any `extensions.code` is preserved for future typed errors. |
| Single graphql instance | Pass | `vitest.config.mts` dedupes/inlines `graphql` so the schema and executor share one module instance, fixing the CJS/ESM "another module or realm" failure; named `.mts` to stay out of the lint/typecheck globs. |
| Conflict-code mapping | Deferred | The handler preserves `extensions.code`, but the services throw generic errors, so no conflict codes are emitted yet; mapping requires a typed-domain-error slice. |

## Validation

All gates passed on 2026-06-17 at commit `4db0fb8`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/api test -- transport.test.ts` | 5 tests pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 217 + 2 skipped; desktop 42; church-context 5) |

## Follow-Ups

- Add typed domain errors in the Presenter service/command layer (stale revision, missing slide, theme/output-target mismatch, validation, authorization) and map them to the `extensions.code` conflict codes the desktop classifier expects; this completes the offline conflict round-trip.
- Bind the request handler to a concrete Node `http` listener (read body, call the handler, write `status`/JSON) as a separate, thin slice.
- Wire the planning schema into the same executable-schema/transport approach when planning needs an HTTP endpoint.
- The handler currently serves the Presenter surface only; extend `typeDefs`/resolvers when other domains need serving.
