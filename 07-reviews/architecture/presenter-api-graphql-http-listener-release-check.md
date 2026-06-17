# API Presenter GraphQL HTTP Listener Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `5162f9a`

## Result

Pass with follow-ups. The slice binds the Presenter GraphQL transport handler to a concrete `node:http` listener. The request/response adaptation (path/method checks, JSON body parsing + Zod validation, serialization) is a pure function tested without a socket, and `createPresenterGraphqlHttpServer` wraps it with `node:http`. The API can now actually serve the Presenter GraphQL surface the desktop sidecar targets. No deployment/TLS config, secret logging, or non-Presenter wiring is added.

## Scope Reviewed

- `apps/api/src/graphql/http-server.ts` + `http-server.test.ts`
- `apps/api/src/graphql/transport.ts`, `presenter-schema.ts`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Pure adapter | Pass | `handlePresenterGraphqlHttpInvocation` is a pure function over `{ method, path, headers, rawBody }`; four unit tests cover a valid POST (200), wrong path (404), non-POST (405), and malformed body (400). |
| Method/path guards | Pass | Only POST to the configured path (default `/graphql`) is served; the path is compared after stripping the query string. |
| Body validation | Pass | The body is parsed and Zod-validated to `{ query, operationName?, variables? }`; malformed JSON yields 400 without invoking the handler. |
| Header normalization | Pass | Node's `string | string[] | undefined` headers are flattened to single strings before reaching the handler. |
| Real HTTP smoke | Pass | A server listening on an ephemeral port serves a real `fetch` POST: 200 with `{ data: { presentations: [] } }` for an authenticated request, 401 for an unauthenticated one. |
| Injected dependencies | Pass | Schema, auth boundary, path, and request-id generator are injected; the factory returns a standard `node:http` `Server` (start/stop via `listen`/`close`). |
| Secret hygiene | Pass | No header, token, or body is logged; errors return generic JSON. |

## Validation

All gates passed on 2026-06-17 at commit `5162f9a`.

| Command | Result |
| --- | --- |
| `pnpm --filter @sanctuary-os/api test -- http-server.test.ts` | 6 tests pass |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces) |
| `pnpm test` | Pass (db 140; api 224 + 2 skipped; desktop 42; church-context 5) |

## Follow-Ups

- Wire the Presenter command service to throw `PresenterDomainError` per real condition (stale revision, missing slide, theme/output-target mismatch, validation, authorization), completing the conflict path with real detection.
- Add a process entry that constructs the schema + auth boundary and calls `server.listen` with env-driven host/port, plus deployment/TLS as appropriate (out of the testable core).
- Desktop tail: process `main`, Tauri sidecar spawn/supervision, minimal status UI.
- Extend the schema/transport to the planning surface when planning needs an HTTP endpoint.
