# Handoff — next slice: Phase 2 production auth

**Resume command:** start a fresh session from `agents.md` + `06-tasks/active/NOW.md`.

**Branch:** `feature/presenter-release-handoff` (pushed).

## Read order
1. `agents.md`
2. `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`
3. `06-tasks/active/NOW.md`
4. `docs/session-summary.md` (top entries: 2026-06-30 comms + OBS) and `docs/running.md`
5. The demo `AuthBoundary` and `AuthenticatedActor` — grep `apps/api/src` for `AuthBoundary` / `DemoAuthBoundary` / `AuthenticatedActor` to see the current seam that a real auth provider must slot behind.

## What just completed (do NOT redo)
- **Live comms is verified.** Real Twilio SMS send-port `apps/api/src/services/community/twilio-send-port.ts` was driven through the consent + human-confirm gate via `pnpm --filter @sanctuary-os/api comms:smoke`; Twilio accepted the gated send (`sent`). Creds in gitignored `apps/api/.env` (`TWILIO_*`). Real US handset delivery may still be gated on the user's A2P (10DLC sole-proprietor) approval — under carrier review; re-run `comms:smoke` to confirm delivery once it clears.
- **Live OBS is verified** (`obs:smoke`). See earlier handoff + session summary.
- Gates green: church-context 5 · db 472 · api 927 (+3 skipped) · desktop 89 · web 239; lint + 5 typechecks.
- Every real outbound/integration adapter (AI draft/suggest, OBS control, Twilio SMS, cloud Postgres) is now built + live-verified. The remaining big rocks are production auth, native shells, and deploy/CI.

## NEXT slice — production auth (BLOCKED on a user decision)
The API authenticates via a demo `AuthBoundary` (fixed demo tenant/actor). Production needs a real identity provider behind that same seam, preserving tenant scoping + role checks.

**Blocker — needs from the user before building:**
1. Provider choice: **Supabase Auth** (already using Supabase for Postgres — natural fit), **Auth0**, or **Clerk**.
2. The provider's project/keys (placed in gitignored `apps/api/.env`; never pasted in chat) once the provider is chosen.

**In-scope steps once decided:**
1. Implement a real `AuthBoundary` that verifies the provider's token/JWT, resolves the `AuthenticatedActor` (actorId, tenantId, roles), and keeps the demo boundary available for local/demo runs (env-gated selection, mirror the AI/Postgres real-vs-fake pattern).
2. Preserve every existing invariant: tenant scope required on every persisted read/write; role gates; no secret/PII leak.
3. Add unit tests (valid token → actor; invalid/expired → rejected; tenant isolation holds) and a runnable smoke if the provider supports one.
4. Gates: `pnpm lint && pnpm typecheck && pnpm test`; release check; update `NOW.md` + `docs/session-summary.md` + this handoff; commit + push.

**Alternatives if the user prefers:** deploy/CI (activates GitHub Actions — needs explicit OK); native shells (Tauri desktop needs Rust; `apps/mobile` is an Expo placeholder).

## Done when
The chosen provider's real `AuthBoundary` verifies a real token and resolves a tenant-scoped actor, the demo path still works, all gates are green, and docs + handoff are updated and pushed.

## Safety reminders (carried from this session)
- Account creation, entering/saving passwords, and entering API tokens into web forms are the USER's to do — direct them, don't do it yourself. Read secrets the user placed locally; write them only to gitignored `apps/api/.env` (via clipboard/pbpaste so values are never printed).
- A fresh git worktree has no `node_modules` (run `pnpm install`) and no `.env` (it is per-worktree, not copied in).
