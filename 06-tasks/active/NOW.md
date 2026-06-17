# NOW

## Task
Scaffold the `apps/desktop` workspace as a minimal TypeScript package integrated with the monorepo lint/typecheck/test gates (no Tauri/Rust shell yet).

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `apps/api/package.json`, `apps/api/tsconfig.json`, the root `package.json`/`pnpm-workspace.yaml`/`tsconfig` and a `packages/*` workspace for the exact lint/typecheck/test wiring to mirror
- Add `apps/desktop/package.json` (`@sanctuary-os/desktop`, `private`, `type: module`, `lint`/`typecheck`/`test` scripts matching the other workspaces), `apps/desktop/tsconfig.json`, and a typed placeholder `src/index.ts` plus `src/index.test.ts`
- Depend on `@sanctuary-os/db` (and `@sanctuary-os/api` if needed) so the persistence selection, migration runner, replay decision, and replay coordinator can be wired into a desktop composition root in a later slice
- Confirm `pnpm -r typecheck`, `pnpm -r test`, and the root `eslint` glob pick up the new workspace and all gates stay green
- Keep the scaffold infrastructure-only: a typed placeholder and wiring, no real Tauri commands, desktop windows, event-bus, replay loop, or UI

## Out of scope
Tauri/Rust shell · real desktop windows · replay loop runtime · desktop UI screens · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · GraphQL/API replay changes

## Progress
- [ ] Re-sync with the workspace wiring of an existing app/package
- [ ] Add `apps/desktop` package.json, tsconfig, and typed placeholder + test
- [ ] Confirm lint, typecheck, and tests pick up and pass for the new workspace
- [ ] Run lint, typecheck, and tests
- [ ] Commit and push the desktop scaffold slice
- [ ] Session handoff

## Done when
`apps/desktop` exists as a typed workspace whose placeholder and test are covered by `pnpm lint`, `pnpm -r typecheck`, and `pnpm -r test`, it can import the local sync queue building blocks, default gates pass, the slice is committed and pushed, and handoff documents identify the exact next task.

## Next task after this
Add a desktop-local Presenter sync persistence + migration composition root in `apps/desktop` that, given an injected SQLite client, migrates the store and exposes the local sync queue repository — then build the replay loop that consumes the decision + coordinator. Address any scaffold findings first.
