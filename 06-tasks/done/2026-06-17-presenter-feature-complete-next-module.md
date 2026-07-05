# Presenter Feature Complete — Next Work Is a New Module

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked. Presenter offline-sync feature complete; next work needs a module plan.

## Presenter offline-sync feature: complete

Built end to end this session, all gate-tested (no-live-engine defaults + `node:sqlite` smokes + `cargo check` + a building sidecar bundle), every slice with a release check and handoff, all pushed to `feature/presenter-domain-contracts`. Four green workspaces: db 143, api 230 (+2 skipped), desktop 54, church-context 5.

- `packages/db`: queue contracts, migration + SQLite migration runner, SQLite repository adapter + executor, persistence composition, replay decision (backoff/limits), status counts + summary.
- `apps/api`: replay coordinator, transport-agnostic `PresenterReplayCommandExecutor`, executable GraphQL schema + transport handler + `node:http` listener, typed `PresenterDomainError` → `extensions.code`, in-memory service conflict detection.
- `apps/desktop`: store, replay pass, scheduler, runtime assembly (+ `getStatus`/`requeueEntry`/`cancelEntry`), network executor + error classifier + fetch transport, runtime bootstrap, sidecar config/entry/env/main, esbuild bundle, status + action HTTP endpoints, status UI with operator requeue/cancel.
- `apps/desktop/src-tauri`: a compiling Tauri 2 shell that builds + spawns + supervises the sidecar and aligns the status port.
- ADRs: 0005 (Node-sidecar SQLite model), 0006 (Node SEA distribution).

Remaining Presenter follow-ups (non-blocking, documented in release checks): the Node SEA binary build + CI; a needs-attention entry list in the UI; SQL-path conflict detection; base-revision staleness.

## Next: a new module needs a plan

`05-plans/` has plans only for `api`, `db`, `planning`, and `presenter`. Play, Charts, Community+, and OBS have no module plan. Per the plan-driven discipline (`agents.md`: read the matching `05-plans/<module>-plan.md` before building), the next module must have a plan authored from `00-product/vision.md` + `01-architecture/system-map.md` before slice-by-slice implementation.

The non-negotiables flag **Play and Charts as offline-first**, suggesting one of them is a sensible next priority, but module priority is a product-scope decision.

## Open questions
- Which module is next (Play, Charts, Community+, OBS)?
- Author its plan first (recommended, matches the discipline used for Presenter), then build slice by slice.
