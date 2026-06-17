# Charts GraphQL + In-Memory Service Release Check

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
Baseline commit: `ed0138b`

## Result

Pass. Charts module slice 5 adds the API-side Charts domain contracts + typed `ChartsDomainError`, a tenant-scoped Zod-validated in-memory Charts service (13 operations), and the GraphQL SDL + resolvers (6 queries, 7 mutations) merged into the executable schema with domain-error → `extensions.code` mapping. In-memory only; the SQL adapter is wired in slice 6.

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Tenant isolation | Pass | The in-memory service keys state per tenant and rejects cross-tenant access with the typed error; service unit tests cover isolation. |
| Validation | Pass | All operation inputs run through Zod operation schemas; validation failure → `ChartsDomainError(VALIDATION_FAILED)`. |
| Per-musician scope | Pass | Annotations/preferences are scoped to `actor.actorId`; writes assert `actor.actorId === input.musicianId` (AUTHORIZATION_FAILED otherwise); `removeChartAnnotation` requires an explicit confirmation intent. |
| GraphQL surface | Pass | Types Chart/ChartArrangement/ChartAnnotation/MusicianChartPreference; queries charts, chart, chartsForSong, chartArrangements, musicianChartPreference, chartAnnotations; mutations saveChart, updateChartSource, saveChartArrangement, setMusicianChartPreference, addChartAnnotation, updateChartAnnotation, removeChartAnnotation. |
| Error transport | Pass | `transport.ts` `formatError` maps `ChartsDomainError` → `extensions.code` + safe message, mirroring presenter. |
| Composition | Pass | The Charts typedefs/resolvers merge into the single executable schema factory (`presenter-schema.ts`) only when charts deps are supplied; presenter-only callers unchanged; `DateTime` declared once. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 166; api 262 + 2 skipped; desktop 54; church-context 5) — independently re-run by the parent. |

## Follow-Ups / Risks

- The Charts operation/query input schemas live in `apps/api/src/domain/charts/contracts.ts` and import `AuthenticatedActorSchema` from `../../auth` (a domain→auth edge). Presenter instead splits records into `domain/` and operations into `services/`. No import cycle, but consider relocating the operation schemas to `services/charts/contracts.ts` for strict parity in a later cleanup.
- Slice 6: wire the slice-4 Charts SQLite adapter behind a persistence-backed Charts service (replacing the in-memory store) + a Charts migration-runner usage; then the offline-sync surface (mirror the presenter local sync queue), then mobile UI.
