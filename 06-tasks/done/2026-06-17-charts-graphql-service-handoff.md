# Handoff — Charts GraphQL schema + in-memory service (slice 5)

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
State: Charts slice 4 (SQLite adapter) DONE + green. This note scopes slice 5.

## Resume
1. Read order: `agents.md` (note "Session continuity protocol"), `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/charts-module-plan.md`, `06-tasks/active/NOW.md`.
2. Build slice 5 exactly per `NOW.md`.

## Pattern to mirror
- `apps/api/src/graphql/presenter.ts` (SDL + resolvers + typed `extensions.code` error mapping)
- `apps/api/src/services/presenter/in-memory.ts` (tenant-scoped in-memory service, Zod-validated)
- Whatever index/transport file composes the executable schema (same place presenter is wired)
- Domain types already exist: `apps/api/src/domain/charts` (ChordPro parse/transpose) and `packages/db` charts contracts (persistence records).

## Scope
SDL types Chart / ChartArrangement / ChartAnnotation / MusicianChartPreference; queries charts, chart, chartsForSong, chartArrangements, musicianChartPreference, chartAnnotations; mutations saveChart, updateChartSource, saveChartArrangement, setMusicianChartPreference, addChartAnnotation, updateChartAnnotation, removeChartAnnotation. In-memory service this slice (SQL adapter is wired in slice 6). Gates green, then commit + push and run the slice ceremony.

## Next slice
Charts slice 6: persistence-backed service over the slice-4 SQLite adapter + migration-runner usage, then offline sync, then mobile UI.
