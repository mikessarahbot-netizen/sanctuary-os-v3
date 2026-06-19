# NOW

## Task
OBS module, slice 6: the GraphQL surface + in-memory service — `apps/api/src/domain/obs/{contracts,errors}.ts`, `apps/api/src/services/obs/in-memory.ts`, `apps/api/src/graphql/obs.ts`, merged into the executable schema. Read-only queries + connection/catalog management + the action REQUEST surface. (The confirm→dispatch GATE is slice 7.) Mirror the Charts/Play/Community slice 5. (OBS slices 1–5 done + green at `bebf94c`.)

## Module / authority
Building OBS from `05-plans/obs-module-plan.md` (authoritative). Final module. NO secrets; the service depends on the slice-5 ObsControlPort (injected). Output-action confirm→dispatch is slice 7 — this slice exposes `requestObsAction` (which never touches the port) + reads/catalog/connection.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`.

## In scope (slice 6)
- Continue on `feature/presenter-domain-contracts`
- Mirror the Charts/Play/Community slice-5 files exactly: domain `contracts.ts` + `errors.ts`, `services/<m>/in-memory.ts`, `graphql/<m>.ts`, and how they merge into `apps/api/src/graphql/presenter-schema.ts` + map errors in `transport.ts` (note Community's enum value maps for hyphenated enums — apply the same if OBS enums have hyphens)
- Add `apps/api/src/domain/obs/contracts.ts` (service operation envelopes `{ actor, requestId, input }` + `ObsQueryService`/`ObsCommandService` interfaces) and `errors.ts` (`ObsDomainError` + codes: CONNECTION_PROFILE/SCENE/SOURCE/SCENE_ITEM/ACTION_INTENT_NOT_FOUND, VALIDATION_FAILED, AUTHORIZATION_FAILED, plus CONFIRMATION_REQUIRED / NOT_CONFIRMED + an ACTION_INELIGIBLE/OBS_DISCONNECTED code as the plan needs)
- Add `apps/api/src/services/obs/in-memory.ts` (tenant-scoped, Zod-validated, injected clock + id generator + the slice-5 ObsControlPort): read queries (connection/scenes/sources/sceneItems/stream/recording/action-intents/log); connection-profile management; refreshObsCatalog (calls the port's getSceneList and persists the snapshot); setStreamState/setRecordingState reads via the port; and `requestObsAction` — builds an ObsActionIntent in status `requested` after running the pure eligibility checker, WITHOUT calling the port (no dispatch yet). The confirm + dispatch are slice 7.
- Add `apps/api/src/graphql/obs.ts` (SDL: enums + the 8 types + queries + the `requestObsAction` mutation + connection/catalog mutations) + resolvers, merged into the executable schema; map `ObsDomainError → extensions.code` in `transport.ts`
- In-memory only this slice (persistence-backed service is slice 8)
- Tests: service unit tests (tenant isolation, validation→typed error, requestObsAction runs eligibility + creates a requested intent + does NOT touch the port, refreshObsCatalog via the fake port, not-found→typed error) + resolver/schema tests (a query, the requestObsAction mutation, an error→extensions.code path)

## Done when
The OBS GraphQL surface (reads + connection/catalog + requestObsAction) is served by an in-memory tenant-scoped Zod-validated service over the fake ObsControlPort, wired into the executable schema with typed error mapping, covered by service + resolver tests, gates green, committed and pushed.

## Next task after this
OBS slice 7: the action GATE — confirmObsAction (the human-confirm step) + dispatchObsAction (the ONLY op that calls the port, refusing unless status=confirmed) + the action-log audit write + an error classifier over ObsControlError. This is the safety core. Then 8 (persistence service), 9 (events), 10 (AI assist). Slices 11–13 await user decisions. After OBS backend the autonomously-buildable backend is complete.
