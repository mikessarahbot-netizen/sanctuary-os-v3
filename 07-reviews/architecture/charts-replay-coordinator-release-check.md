# Charts Offline-Sync Replay Layer Release Check

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
Baseline commit: `e9acfa6`

## Result

Pass. Charts slice 7b adds the replay layer on the slice-7 queue: a pure replay decision (`packages/db/src/charts-local-sync-queue-replay.ts`), a status summary + `countByStatus` on the queue repositories (`charts-local-sync-queue-status.ts` + repo additions), and an api-side coordinator (`apps/api/src/services/charts/local-sync-queue-replay-coordinator.ts`) mapping queued Charts ops to the `ChartsCommandService`.

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Pure decision | Pass | Entry + injected clock → replay-now / wait(backoff) / give-up; exponential backoff (base·mult^(n-1), capped) + attempt limit; no I/O, no `Date.now()`. |
| Status summary | Pass | `countByStatus` on both in-memory and SQL queue repos (GROUP BY status), tenant-scoped. |
| Coordinator | Pass | Pulls ready entries, maps each of the 7 ops to the command service, classifies success→synced / retryable→requeue+backoff / terminal→failed; command service injected via interface. |
| Error classification | Pass | Typed `ChartsDomainError` → terminal (surfaces redacted safe message); other → retryable (generic safe message); classifier injectable. |
| Payload mapping | Pass | Queue stores persistence records; coordinator maps persistence payload → command input (drops schemaVersion/timestamps/annotationId) and re-validates via the command schemas; tenant guard on map. |

## Validation

| Command | Result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Pass (db 235; api 284 + 2 skipped; desktop 54; church-context 5) — independently re-run by the parent. |

## Milestone / Follow-Ups

- **Charts backend is complete end-to-end** (slices 1–7b): ChordPro core, persistence contracts, migration, SQLite adapter, GraphQL + in-memory service, persistence-backed service, offline-sync queue, replay decision/status/coordinator.
- Remaining Charts work, **slice 8 — the Charts mobile UI**, requires first scaffolding the bare `apps/mobile` Expo/React Native workspace (navigation, GraphQL client, local-queue integration, test setup). That is a larger architectural step; flagged for a decision with the user (see `NOW.md`).
- A desktop/runtime composition wiring the Charts replay coordinator on a schedule (mirroring the presenter desktop replay runtime) is an optional later backend slice.
