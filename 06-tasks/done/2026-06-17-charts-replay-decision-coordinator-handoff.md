# Handoff — Charts replay decision + coordinator (slice 7b)

Date: 2026-06-17
Branch: `feature/presenter-domain-contracts`
State: Charts slices 1–7 DONE + green (through the offline-sync queue contracts + repository). This note scopes slice 7b.

## Resume
1. Read order: `agents.md` (note "Session continuity protocol"), `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/charts-module-plan.md`, `06-tasks/active/NOW.md`.
2. Build slice 7b exactly per `NOW.md`.

## Pattern to mirror (presenter replay)
- `packages/db/src/presenter-local-sync-queue-replay.ts` — the pure replay decision (ready/backoff/give-up)
- `packages/db/src/presenter-local-sync-queue-status.ts` — status summary / countByStatus
- `apps/api/src/services/presenter/local-sync-queue-replay-coordinator.ts` + `apps/desktop/src/replay-pass.ts` / `replay-scheduler.ts` / `replay-error-classifier.ts` / `network-command-service.ts` — the coordinator + injected network boundary + error classification
- Slice-7 queue: `packages/db/src/charts-local-sync-queue-*` and the Charts command service (`apps/api/src/services/charts/*`).

## Scope
A pure Charts replay decision (entry + clock → replay/backoff/give-up), a status summary on the queue repos, and a coordinator mapping a queued Charts op → the `ChartsCommandService`, classifying success / retryable / terminal and updating queue status (synced / requeue+backoff / failed). Network/transport boundary injected for unit-testability. Tests for decision, status, and coordinator. Gates green, then commit + push and run the slice ceremony.

## Upcoming
Slice 8: Charts mobile UI. After Charts: Play → Community+ → OBS (each: author plan from vision + system map, then slice-by-slice).
