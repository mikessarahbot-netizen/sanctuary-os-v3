# NOW

## Task
Charts module, slice 2: the Charts persistence contracts in `packages/db` (Chart, ChartArrangement, ChartAnnotation, MusicianChartPreference), tenant-scoped and Zod-validated.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `05-plans/charts-module-plan.md`, `packages/db/src/presenter-repository-contracts.ts` (mirror its style), `packages/db/src/repository-contracts.ts`, and `apps/api/src/domain/charts/chordpro.ts`
- Add `packages/db/src/charts-repository-contracts.ts`: strict Zod persistence record schemas for `Chart` (tenant, chartId, songRef, arrangementRef, defaultKey, chordProSource, title/metadata), `ChartArrangement` (tenant, arrangementRef, songRef, label, defaultKey, capo, sectionOrder), `ChartAnnotation` (tenant, annotationId, chartId, musicianId, sectionIndex/lineIndex anchor, kind, note/color), and `MusicianChartPreference` (tenant, chartId, musicianId, transposeSemitones, capo, instrument, fontScale, chordsVisible)
- Add read/write persistence option schemas and operation schemas mirroring the presenter ones (require an actor; tenant-scoped), plus the `ChartsQueryPersistenceRepository` and `ChartsCommandPersistenceRepository` interfaces with the operations from the plan
- Validate the stored `chordProSource` is parseable (cross-check with `parseChordPro`) or store it as opaque text with a separate render step — keep the contract storing source text and a schema-version, deferring the runtime adapter
- Export from the `packages/db` barrel
- Add focused schema tests (valid records, tenant/musician scoping refinements, rejection of unknown fields)
- Keep this slice persistence contracts only; no SQLite adapter, migration, GraphQL, or service wiring

## Out of scope
SQLite adapter/migration · GraphQL/API surface · service layer · offline sync · mobile UI · CCLI/catalog · AI suggestions

## Progress
- [ ] Re-sync with the Charts plan and presenter persistence contract style
- [ ] Add the Charts persistence record schemas (chart/arrangement/annotation/preference)
- [ ] Add read/write option + operation schemas and the query/command repository interfaces
- [ ] Add focused schema tests
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the Charts persistence contracts slice
- [ ] Session handoff

## Done when
The Charts persistence contracts define tenant-scoped, Zod-validated records and repository interfaces mirroring the presenter contracts, covered by focused schema tests, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next Charts slice (the SQLite migration + adapter).

## Next task after this
Charts slice 3: the Charts SQLite migration artifact + migration tests (mirroring the presenter local sync queue migration), then the SQLite repository adapter.
