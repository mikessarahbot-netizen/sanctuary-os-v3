# Handoff — next slice: comms carrier send-port adapter

**Resume command:** start a fresh session from `agents.md` + `06-tasks/active/NOW.md`.

**Branch:** `feature/presenter-release-handoff` (pushed). Latest work: live OBS verification (see below).

## Read order
1. `agents.md`
2. `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`
3. `06-tasks/active/NOW.md`
4. `docs/session-summary.md` (top entry: 2026-06-30 live OBS) and `docs/running.md`
5. `05-plans/community-plus-module-plan.md` (slice 11 = send-integration behind a carrier decision)

## What just completed (do NOT redo)
- **Live OBS control is verified.** Real obs-websocket-v5 adapter `apps/api/src/services/obs/obs-websocket-control-port.ts` was driven against a running OBS Studio through the request→confirm→dispatch gate via `pnpm --filter @sanctuary-os/api obs:smoke` (`apps/api/src/demo/obs-live-smoke.ts`). Scene-switch only; no stream/recording action issued. Gates green (church-context 5 · db 472 · api 920 +3 skipped · desktop 89 · web 239; lint + 5 typechecks).
- OBS connection lives in gitignored `apps/api/.env` as `SANCTUARY_OS_OBS_URL` / `SANCTUARY_OS_OBS_PASSWORD` — treat as secret; never print/commit. (`.env` is fresh per worktree — run `pnpm install` in a new worktree.)

## NEXT slice — comms carrier send-port adapter (BLOCKED on a user decision)
The Community+ comms flow currently ends at a FAKE send port. This is the one outbound path with no real adapter. It is the same "ready-to-wire injected port" pattern as the OBS control port and the Anthropic AI ports.

**Blocker — needs from the user before building:**
1. Provider choice: **Twilio** (SMS) / **Resend** (email) / **SendGrid** (email).
2. API key + a verified sender (from-number or from-address), placed in gitignored `apps/api/.env` (do not paste secrets in chat — use the local prompt / clipboard).

**In-scope steps once decided:**
1. Build the real send-port adapter co-located with the community send port (mirror `anthropic-ai-draft-port.ts` / `obs-websocket-control-port.ts`): injected, SDK-typed client; never logs the key or raw recipient PII; normalizes vendor failures to a typed, redacted error.
2. Keep the existing consent + human-confirm gate: AI may draft, only an explicit human Confirm queues/sends. Do NOT let the adapter send unconfirmed.
3. Add a runnable live smoke (`<provider>:smoke`, mirror `obs:smoke` / `ai:smoke`), env-gated, that sends ONE message to a user-approved test recipient — confirm the recipient with the user first (sending is an outward-facing action requiring explicit per-action approval).
4. Gates: `pnpm lint && pnpm typecheck && pnpm test`; release check; update `NOW.md` + `docs/session-summary.md` + this handoff; commit + push.

**Alternatives if the user prefers:** Phase 2 production auth decision (Supabase Auth / Auth0 / Clerk); deploy/CI (needs explicit OK — activates GitHub Actions).

## Done when
The chosen provider's real send-port adapter replaces the fake, is live-verified by sending one approved test message through the confirm gate, all gates are green, and docs + handoff are updated and pushed.
