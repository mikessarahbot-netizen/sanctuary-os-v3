# Desktop Workspace Scaffold Release Check

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`  
Baseline commit: `253bb99`

## Result

Pass with follow-ups. The slice scaffolds `apps/desktop` as a minimal `@sanctuary-os/desktop` TypeScript workspace mirroring the existing app/package wiring, integrated into the monorepo lint/typecheck/test gates. The placeholder consumes `@sanctuary-os/db` to resolve the local sync queue persistence runtime config, proving the workspace builds and can wire the shared building blocks. It introduces no Tauri/Rust shell, no real desktop windows, no replay loop, and no checked-in secret.

## Scope Reviewed

- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json`
- `apps/desktop/src/index.ts`
- `apps/desktop/src/index.test.ts`
- root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- `apps/api/package.json`, `apps/api/tsconfig.json`

## Findings

| Area | Status | Evidence |
| --- | --- | --- |
| Workspace recognition | Pass | `pnpm install` reports 5 workspace projects (was 4); `pnpm -r typecheck` and `pnpm -r test` both run `apps/desktop`. |
| Wiring parity | Pass | `package.json` and `tsconfig.json` mirror the other workspaces (`type: module`, `lint`/`typecheck`/`test` scripts, `extends ../../tsconfig.base.json`, `rootDir`/`outDir`/`include`). |
| Shared-package consumption | Pass | `src/index.ts` imports `parsePresenterLocalSyncQueuePersistenceRuntimeConfig` from `@sanctuary-os/db` (declared `workspace:*` dependency) and resolves a typed runtime description. |
| Gate coverage | Pass | The root `eslint` glob lints `apps/desktop`, `tsc --noEmit` typechecks it, and `vitest run` covers its 3 placeholder tests. |
| Lockfile | Pass | `pnpm-lock.yaml` records the new workspace dependency; `pnpm install` reports "Already up to date" afterward. |
| Out-of-scope avoidance | Pass | The slice adds only workspace config, a typed placeholder, and its test. No Tauri command, desktop window, replay loop, event bus, OBS/stream, vendor, or Auth0 code is added. |
| Checked-in secrets | Pass | No credentials, tokens, or PII are introduced. |

## Validation

All gates passed on 2026-06-17 at commit `253bb99`.

| Command | Result |
| --- | --- |
| `pnpm install` | 5 workspace projects linked |
| `pnpm lint` | Pass (0 warnings) |
| `pnpm typecheck` | Pass (all 4 workspaces, including `apps/desktop`) |
| `pnpm test` | All workspace tests pass (desktop 3; api 212 + 2 skipped; db 140; church-context 5) |

## Follow-Ups

- Add a desktop-local Presenter sync composition root in `apps/desktop` that, given an injected SQLite client, runs the migration runner and exposes the local sync queue repository via the persistence selection.
- Build the desktop replay loop that consumes `decidePresenterLocalSyncQueueReplay` and `mapPresenterLocalSyncQueueEntryToReplayCommand`, driving the `PresenterCommandService` and marking entries replaying/synced/conflict/failed.
- The actual Tauri shell, window management, and OS packaging remain separate later slices with their own tooling considerations (Rust toolchain).
