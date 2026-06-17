# NOW

## Task
Charts module, slice 5: the Charts GraphQL schema + resolvers plus the in-memory service, wired into the executable schema/transport — mirroring the presenter GraphQL.

## Session protocol (in force)
Keep context small: at clean breakpoints commit + push all work, write the handoff, then hand off to a fresh session. See `agents.md` › "Session continuity protocol". Charts slice 4 (the SQLite adapter) is DONE and green; this is the next slice.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, and the presenter GraphQL + service for style: `apps/api/src/graphql/presenter.ts`, `apps/api/src/services/presenter/in-memory.ts`, and how they wire into the executable schema/transport (`apps/api/src/graphql/*` index/transport)
- Define the Charts GraphQL SDL: types `Chart`, `ChartArrangement`, `ChartAnnotation`, `MusicianChartPreference`; queries `charts`, `chart`, `chartsForSong`, `chartArrangements`, `musicianChartPreference`, `chartAnnotations`; mutations `saveChart`, `updateChartSource`, `saveChartArrangement`, `setMusicianChartPreference`, `addChartAnnotation`, `updateChartAnnotation`, `removeChartAnnotation`
- Add an in-memory Charts service implementing those operations (tenant-scoped maps), Zod-validating all inputs, mirroring the presenter in-memory service
- Resolvers translate GraphQL args → domain operations → service; map domain errors to typed GraphQL `extensions.code` as the presenter resolvers do
- Wire the Charts schema + resolvers into the executable schema and transport
- Tests: resolver/service unit tests (tenant isolation, validation failure → typed error, round-trips)
- Reuse the domain ChordPro types from `apps/api/src/domain/charts` where the SDL needs parsed/transposed output (optional read-side field), but keep persistence-shaped records as the storage contract

## Out of scope
Wiring the SQL adapter behind the service (stay in-memory this slice) · offline sync · mobile UI · charts migration-runner wiring

## Progress
- [ ] Re-sync with the presenter GraphQL + service and the charts plan
- [ ] Charts SDL + resolvers
- [ ] In-memory Charts service (tenant-scoped, Zod-validated)
- [ ] Wire into the executable schema/transport
- [ ] Resolver/service tests
- [ ] Run lint, typecheck, test green
- [ ] Release check + handoff + session-summary + NOW.md advance
- [ ] Commit + push the slice

## Done when
The Charts GraphQL surface (queries + mutations) is served by an in-memory, tenant-scoped, Zod-validated service wired into the executable schema/transport, covered by resolver/service tests, default gates green, committed and pushed.

## Next task after this
Charts slice 6: wire the Charts SQLite adapter (slice 4) behind a persistence-backed service + a Charts migration-runner usage, then the offline-sync surface (mirror the presenter local sync queue), then mobile UI.
