# NOW — active task

**Branch:** `main` — consolidated 2026-07-05. All prior worktree/branch work (foundation → presenter → operator modules → live OBS/Twilio verification) is merged here and pushed to origin. The old `.codex`/`.claude` worktrees are removed; `main` on the Desktop checkout is the single source of truth.

**Checkout:** `/Users/SarahBot/Desktop/sanctuary-os-v3`. Preview launch config name: `web` (port 5173, proxies `/graphql` → demo API on :4000).

## Active task — voice bridge (`ask_sanctuary`)
Expose a narrow, policy-gated HTTP endpoint so Michael's existing xAI phone voice agent can query and (with confirmation) operate Sanctuary OS.

### In scope
- `POST /voice/ask` on the demo API server: bearer-key auth (`SANCTUARY_OS_VOICE_KEY`, gitignored `.env`), request `{ "request": "<natural language>" }`.
- Policy gate before anything executes: classify to `allow` (read-only status/setlist/schedule queries), `confirm` (any mutation — return "needs confirmation in the web UI", never execute), `block` (destructive/secret/PII requests). Reuse the existing human-confirm gate services — voice may request, never bypass.
- Route allowed queries through existing services; answer in short plain text suitable for TTS.
- JSONL audit log of every voice request (timestamp, category, summary, status — no secrets, no PII bodies).
- Tests: policy classification, auth rejection, allow-path answer, confirm-path refusal, audit redaction.
- `docs/voice-connect.md`: exact steps to point the xAI phone agent at this endpoint over Tailscale (local/tailnet only — no public tunnels, no Funnel).

### Out of scope
LiveKit/realtime audio (lives in `~/Projects/alfred-voice`) · executing mutations by voice · new auth systems · public exposure.

## Done + verified + pushed (do NOT rebuild)
- Four modules (Charts / Play / Community+ / OBS): backend services + Vite/React web SPA, human-confirm gates (OBS scene + stream start/stop; Community comms draft→reviewed→confirmed→queued/sent — AI may draft, never send).
- On-disk SQLite persistence, restart-durable (`pnpm --filter @sanctuary-os/api dev:persistent`, `DEMO_DB_PATH`).
- e2e web↔api GraphQL contract tests; adversarial safety audit (gates can't be bypassed, tenant isolation, no secret/PII leak — all hold).
- **AI live-verified in the browser:** Community AI-draft + OBS AI-suggest, real `claude-opus-4-8` adapters (`apps/api/src/services/{community/anthropic-ai-draft-port,obs/anthropic-ai-suggest-port}.ts`), env-gated on `ANTHROPIC_API_KEY`. `pnpm --filter @sanctuary-os/api ai:smoke`.
- **PostgreSQL backend (Supabase verified):** `packages/db/src/postgresql-operator-executor.ts`, `apps/api/src/demo/postgres-server.ts` (`dev:postgres`, gated on `SANCTUARY_OS_POSTGRES_URL`). 26-table schema deployed + round-trip-verified on Supabase project "Claude Projects" (`kmprojychrtodbemvwcd`); live integration test passes.
- **Live OBS control (obs-websocket v5, live-verified):** `apps/api/src/services/obs/obs-websocket-control-port.ts`, smoke `pnpm --filter @sanctuary-os/api obs:smoke` — scene switch through the request→confirm→dispatch gate only.
- **Community+ real Twilio SMS send-port (live-verified):** `apps/api/src/services/community/twilio-send-port.ts`, smoke `pnpm --filter @sanctuary-os/api comms:smoke` — one SMS through consent + human-confirm gate; Twilio accepted (status `sent`). US handset delivery may still be gated on the user's A2P review.

Gates: **db 472 · api 920 (+3 skipped without live Postgres env) · web 239 · desktop 89 · church-context 5**; lint + 5 typechecks green.

## Remaining gated paths (need a user credential / account / hardware / decision)
- Production auth: pick a provider (Supabase Auth / Auth0 / Clerk), then replace the demo `AuthBoundary`. Needs the provider decision first.
- Native shells: Tauri desktop (needs Rust toolchain) + Expo mobile (placeholder + UX decision).
- Deploy/CI: a host + a GitHub Actions workflow (activates Actions on the user's account — needs explicit OK).
- Twilio A2P: once carrier review clears, re-run `comms:smoke` to confirm handset delivery.

## How to run / verify
See `docs/running.md`. Standard gate suite: `pnpm lint && pnpm typecheck && pnpm test`.
