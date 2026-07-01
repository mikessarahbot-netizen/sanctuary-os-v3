# NOW — active task

**Branch:** `feature/presenter-release-handoff` (pushed to origin; HEAD `b9805db` before the cloud-persistence verification slice). NOT `feature/presenter-domain-contracts` (stale, checked out in another worktree — verify the branch yourself; a prior summary got it wrong).

**Worktree:** `/Users/SarahBot/.codex/worktrees/presenter-release-handoff`. Preview launch config name: `web` (port 5173, proxies `/graphql` → demo API on :4000).

## Done + verified + pushed (do NOT rebuild)
- Four modules (Charts / Play / Community+ / OBS): backend services + Vite/React web SPA, human-confirm gates (OBS scene + stream start/stop; Community comms draft→reviewed→confirmed→queued/sent — AI may draft, never send).
- On-disk SQLite persistence, restart-durable (`pnpm --filter @sanctuary-os/api dev:persistent`, `DEMO_DB_PATH`).
- e2e web↔api GraphQL contract tests; adversarial safety audit (gates can't be bypassed, tenant isolation, no secret/PII leak — all hold).
- **AI fully surfaced + LIVE-verified in the browser, both modules:** Community AI-draft + OBS AI-suggest, real `claude-opus-4-8` adapters (`apps/api/src/services/{community/anthropic-ai-draft-port,obs/anthropic-ai-suggest-port}.ts`), env-gated via `apps/api/src/demo/{community-ai,obs-ai}.ts` on `ANTHROPIC_API_KEY` (in gitignored `apps/api/.env`). Adapters strip empty-string optional fields + use NO adaptive thinking (two bugs caught by live verification). `pnpm --filter @sanctuary-os/api ai:smoke` smoke-tests them.
- **PostgreSQL backend for the 4 modules (Supabase verified):** `packages/db/src/postgresql-operator-executor.ts` (translates `?`→`$N`; SQLite SQL untouched), `apps/api/src/demo/postgres-server.ts` (`dev:postgres`, gated on `SANCTUARY_OS_POSTGRES_URL`, isolates objects in a `sanctuary_os` schema). The 26-table schema is **DEPLOYED + SQL-round-trip-verified** on the user's Supabase project **"Claude Projects" (`kmprojychrtodbemvwcd`)**, and `src/services/charts/postgresql-integration.test.ts` now passes against the live Supabase session-pooler URL in `apps/api/.env`.
- **Live OBS control (real obs-websocket v5, LIVE-verified):** the real adapter `apps/api/src/services/obs/obs-websocket-control-port.ts` was live-verified against a running OBS Studio (v32.1.2, obs-websocket v5 on `ws://127.0.0.1:4455`, auth on; URL+password in gitignored `apps/api/.env` as `SANCTUARY_OS_OBS_URL`/`SANCTUARY_OS_OBS_PASSWORD` — do not print/commit). Runnable smoke `apps/api/src/demo/obs-live-smoke.ts` (`pnpm --filter @sanctuary-os/api obs:smoke`) wires a connected `OBSWebSocket` into the in-memory OBS service's `controlPort`, then drives a program-scene switch **through the request→confirm→dispatch gate** (never a direct port mutate) and asserts the switch via a live `getCurrentProgramScene` read, then restores. Scene-switch only — no live stream/recording action was ever issued.
- **Community+ comms send-port (real Twilio SMS, LIVE-verified):** real adapter `apps/api/src/services/community/twilio-send-port.ts` (`createTwilioSendPort`, official `twilio` SDK, injected client + injected contact/body resolvers — the adapter never reads the SID/token and never logs recipient PII; Twilio errors map to a fixed redacted table; classifies Twilio errors structurally by numeric code/status, NOT `instanceof RestException`, which doesn't survive CJS→ESM). Replaces the fake `CommunicationSendPort`. Runnable smoke `apps/api/src/demo/comms-live-smoke.ts` (`pnpm --filter @sanctuary-os/api comms:smoke`) drives one SMS **through the consent + human-confirm gate** (`draft→review→confirm→queue`; never calls `sendPort.send` directly) and Twilio ACCEPTED it (status `sent`). Creds in gitignored `apps/api/.env`: `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER`/`TWILIO_TEST_TO` — secret; never print/commit. NOTE: the user's number A2P (10DLC sole-proprietor) is under carrier review; Twilio accepting the API request proves the adapter+gate, but final US handset delivery may remain gated on A2P approval (check the Twilio Console message log).

Gates: **db 472 · api 920 (+3 skipped without live Postgres env) · web 239 · desktop 89 · church-context 5**; lint + 5 typechecks green.

## Completed slice — cloud-persistence verification
- Added `SANCTUARY_OS_POSTGRES_URL` locally in gitignored `apps/api/.env` via a hidden password prompt; do not commit or print the value.
- Ran the live Supabase adapter-level smoke against the session-pooler URL. It initially exposed a real PostgreSQL null-bind inference bug in optional filters such as `? IS NULL OR song_id = ?`.
- Fixed the operator SQL repositories to cast optional null-guard bind parameters as text while preserving SQLite compatibility.
- Verification passed:
  - `SANCTUARY_OS_POSTGRES_URL=<set> pnpm --filter @sanctuary-os/api exec vitest run src/services/charts/postgresql-integration.test.ts`
  - `pnpm --filter @sanctuary-os/db exec vitest run src/charts-sql-repository.test.ts src/play-sql-repository.test.ts src/community-sql-repository.test.ts src/obs-sql-repository.test.ts`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

## NEXT slice — choose the next gated path
- **Recommended next:** start the Phase 2 production auth decision (Supabase Auth / Auth0 / Clerk). Needs the provider decision from the user before scaffolding.
- Alternative: deploy/CI (needs explicit OK — activates GitHub Actions).
- Follow-up (no new decision): once the user's Twilio A2P clears review, re-run `comms:smoke` to confirm real handset delivery (the adapter is already done).

## Remaining gated paths (need a user credential / account / hardware / decision)
- ~~Live OBS~~ — DONE (live-verified 2026-06-30; see the done list + `obs:smoke`).
- ~~Comms carrier~~ — DONE (real Twilio SMS send-port live-verified 2026-06-30; see the done list + `comms:smoke`). Real US handset delivery may still be gated on the user's A2P approval, but the adapter + gate are proven.
- Production auth: pick a provider (Supabase Auth / Auth0 / Clerk), then replace the demo `AuthBoundary` with a real one behind it. Needs the provider decision first.
- Native shells: Tauri desktop (needs Rust toolchain) + Expo mobile (`apps/mobile` is a placeholder + a UX decision).
- Deploy/CI: a host + a GitHub Actions workflow (activates Actions on the user's account — needs explicit OK).

## How to run / verify
See `docs/running.md`. Standard gate suite: `pnpm lint && pnpm typecheck && pnpm test`.
