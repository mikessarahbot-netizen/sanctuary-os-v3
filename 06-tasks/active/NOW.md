# NOW — active task

**Branch:** `feature/presenter-release-handoff` (pushed to origin; HEAD `c441534`). NOT `feature/presenter-domain-contracts` (stale, checked out in another worktree — verify the branch yourself; a prior summary got it wrong).

**Worktree:** `/Users/SarahBot/.codex/worktrees/presenter-release-handoff`. Preview launch config name: `web` (port 5173, proxies `/graphql` → demo API on :4000).

## Done + verified + pushed (do NOT rebuild)
- Four modules (Charts / Play / Community+ / OBS): backend services + Vite/React web SPA, human-confirm gates (OBS scene + stream start/stop; Community comms draft→reviewed→confirmed→queued/sent — AI may draft, never send).
- On-disk SQLite persistence, restart-durable (`pnpm --filter @sanctuary-os/api dev:persistent`, `DEMO_DB_PATH`).
- e2e web↔api GraphQL contract tests; adversarial safety audit (gates can't be bypassed, tenant isolation, no secret/PII leak — all hold).
- **AI fully surfaced + LIVE-verified in the browser, both modules:** Community AI-draft + OBS AI-suggest, real `claude-opus-4-8` adapters (`apps/api/src/services/{community/anthropic-ai-draft-port,obs/anthropic-ai-suggest-port}.ts`), env-gated via `apps/api/src/demo/{community-ai,obs-ai}.ts` on `ANTHROPIC_API_KEY` (in gitignored `apps/api/.env`). Adapters strip empty-string optional fields + use NO adaptive thinking (two bugs caught by live verification). `pnpm --filter @sanctuary-os/api ai:smoke` smoke-tests them.
- **PostgreSQL backend for the 4 modules (Supabase-ready):** `packages/db/src/postgresql-operator-executor.ts` (translates `?`→`$N`; SQLite SQL untouched), `apps/api/src/demo/postgres-server.ts` (`dev:postgres`, gated on `SANCTUARY_OS_POSTGRES_URL`, isolates objects in a `sanctuary_os` schema). The 26-table schema is **DEPLOYED + SQL-round-trip-verified** on the user's Supabase project **"Claude Projects" (`kmprojychrtodbemvwcd`)** via the Supabase MCP.

Gates: **db 472 · api 908 (+3 skipped) · web 239 · desktop 89 · church-context 5**; lint + 5 typechecks green.

## NEXT slice — finish cloud-persistence verification (small; needs ONE user input)
- **In-scope steps:** the user puts the Supabase Postgres connection string for "Claude Projects" into `apps/api/.env` as `SANCTUARY_OS_POSTGRES_URL=postgresql://...` (the DB password is the user's; the MCP doesn't expose it). Then run the adapter-level verify against the already-deployed `sanctuary_os` schema:
  - `SANCTUARY_OS_POSTGRES_URL=... pnpm --filter @sanctuary-os/api exec vitest run src/services/charts/postgresql-integration.test.ts` (un-skips → CRUD round-trip for all 4 modules), and/or
  - `SANCTUARY_OS_POSTGRES_URL=... pnpm --filter @sanctuary-os/api dev:postgres` then drive the web app in live mode.
- **Done when:** the charts postgresql-integration test passes against real Supabase, proving the 4 modules' adapter CODE (not just the schema) persists to cloud Postgres end-to-end. Then commit a `docs`/`test` note + push.

## Remaining gated paths (need a user credential / account / hardware / decision)
- Live OBS: real obs-websocket adapter in `packages/obs-agent` + a running OBS instance + host/password.
- Comms carrier: pick a provider (Twilio / Resend / SendGrid) + API key + verified sender → replace the fake send port.
- Native shells: Tauri desktop (needs Rust toolchain) + Expo mobile (`apps/mobile` is a placeholder + a UX decision).
- Deploy/CI: a host + a GitHub Actions workflow (activates Actions on the user's account — needs explicit OK).

## How to run / verify
See `docs/running.md`. Standard gate suite: `pnpm lint && pnpm typecheck && pnpm test`.
