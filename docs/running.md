# Sanctuary OS — Application Guide

Sanctuary OS is an operator console for running a church service: song **Charts**,
sequence/audio **Play**back, **Community+** (people, attendance, communications),
and **OBS** stream control — under a hard rule that high-stakes actions (going
live, switching what the congregation sees, sending a message to people) require
explicit **human confirmation**, and that **no secrets or personal data** ever
enter domain records.

This guide covers what's here, how to run it, and the safety model. For the
agent/workspace governance (token tiers, task flow), see [../README.md](../README.md).

## Monorepo layout

| Path | What |
|---|---|
| `apps/api` | GraphQL backend — the 4 modules' services + the demo servers |
| `apps/web` | Vite + React operator SPA (4 tabs) |
| `apps/desktop` | Tauri shell + Node sidecar (presenter replay runtime) |
| `apps/mobile` | placeholder — not yet built |
| `packages/db` | persistence — SQLite executor, migrations, per-module repositories |
| `packages/church-context` | shared domain/context types |
| `packages/{obs-agent,ai-engine,midi-bridge,ui}` | scaffolds for live integrations — not yet wired |

Each module (charts / play / community / obs) follows one pattern: Zod-validated
domain + pure logic → persistence contracts → SQL migration → SQLite adapter
(over an injected executor) → GraphQL schema + an in-memory service → a
persistence-backed service + composition. The in-memory and SQLite services are
interface-compatible, so the same GraphQL schema runs over either.

## Run it

Prereqs: **Node 22+** (the persistence layer uses the built-in `node:sqlite`) and
`pnpm`. Install once: `pnpm install`.

**Backend (demo GraphQL API)** — serves `POST /graphql` on `http://127.0.0.1:4000`:

```bash
pnpm --filter @sanctuary-os/api dev              # in-memory (ephemeral)
pnpm --filter @sanctuary-os/api dev:persistent   # on-disk SQLite, restart-durable
# persistent DB path: DEMO_DB_PATH=/path/to.db   (default ./.sanctuary-demo.db)
```

The persistent server seeds once into an empty database and **reuses** it on
restart — data survives a restart and is never re-seeded/duplicated.

**Web app** — `http://127.0.0.1:5173`:

```bash
pnpm --filter @sanctuary-os/web dev
```

- Default: **demo mode** — in-browser sample data, no API needed.
- **Live mode**: start the API (above), then open
  `http://127.0.0.1:5173/?source=live` (or set `VITE_DATA_SOURCE=live`). The dev
  server proxies `/graphql` → the API (override with `VITE_API_PROXY_TARGET`), so
  it stays same-origin and needs no CORS.

In live mode the web client sends a demo bearer token (`demo-web-operator`); the
demo auth boundary accepts any non-empty token and resolves a fixed demo
tenant/actor.

## Test & gates

```bash
pnpm lint && pnpm typecheck && pnpm test                     # full gate suite
pnpm --filter @sanctuary-os/web test:e2e                     # web↔api contract (boots a real server)
pnpm --filter @sanctuary-os/api test:integration:postgres    # requires a running Postgres
```

Current suite: **db 472 · api 920** (+3 Postgres-only skips) **· web 239** (incl.
e2e) **· desktop 89 · church-context 5**.

## Safety model (enforced in code, covered by tests)

- **Human-confirm gates.** High-stakes actions are a three-step
  `request → confirm → dispatch`; dispatch refuses any intent a human did not
  confirm (`NOT_CONFIRMED`).
  - **OBS** — switching the program scene, and **starting/stopping the live stream**.
  - **Community comms** — a message goes `draft → reviewed → confirmed → queued/sent`
    and cannot be queued before a human confirms. **AI may draft, but never sends.**
- **No secrets or PII in domain records.** OBS connections carry only an opaque
  `vault://` ref (never host/port/password/stream-key). Community carries an
  opaque contact-channel ref + consent status only (no raw email/phone);
  engagement summaries are PII-free.
- **Tenant-scoped.** Every persisted read and write is scoped to the acting tenant.
- **AI is a sandboxed port.** AI assist is an injected port (faked in tests); no
  PII is shared unless a tenant's policy explicitly allows it.

## Status — built vs. needs integration

**Built + verified** (backend + web; gated, persisted, e2e-tested): Charts, Play,
Community+, OBS; on-disk SQLite persistence with restart-durability; the web↔api
GraphQL contract.

**Real integrations BUILT (ready to wire) — each needs only its credential to go live:**

- **AI assist** — real Anthropic adapters (Community draft + OBS suggest) on the
  official `@anthropic-ai/sdk`, **LIVE-VERIFIED end-to-end** in the browser against
  `claude-opus-4-8` and surfaced in the Community/OBS web UI (env-gated on
  `ANTHROPIC_API_KEY`; demo uses fakes without a key). See "Live AI" below.
- **Cloud Postgres** — the 4 modules run over PostgreSQL via a `?`→`$N` translator
  (SQLite SQL untouched); the 26-table schema is **deployed + SQL-verified on
  Supabase**, and the live adapter-level smoke passes against the Supabase session
  pooler when `SANCTUARY_OS_POSTGRES_URL` is set in `apps/api/.env`.
- **Live OBS** — real obs-websocket-v5 adapter
  (`apps/api/src/services/obs/obs-websocket-control-port.ts`), unit-tested **and
  LIVE-verified** against a running OBS Studio: `pnpm --filter @sanctuary-os/api
  obs:smoke` connects an `OBSWebSocket` (url/password from `apps/api/.env`), wires
  the real port into the in-memory OBS service, and switches the program scene
  through the confirm gate.

**Still needs an account / hardware / product decision:**

- **Comms carrier** — pick a provider (Twilio / Resend / SendGrid) + API key to
  replace the fake send port.
- **Native shells** — the Tauri desktop shell (Rust toolchain) and the Expo mobile
  app (`apps/mobile` is a placeholder + a UX decision).
- **Deploy / CI** — a host + a GitHub Actions workflow.

### Live AI (real Anthropic adapters)

The two AI-assist ports (Community+ comms drafting, OBS action suggestions) ship
real, Anthropic-backed adapters built on the official `@anthropic-ai/sdk`. They are
**live-verified end-to-end** against the real model and surfaced in the web UI;
going live needs `ANTHROPIC_API_KEY` in the deploy environment (the SDK reads it; it
is never handled in code). The demo servers keep using the fake/no-op ports without a key.

To wire them live, inject the real adapters in place of the fakes when
`ANTHROPIC_API_KEY` is set (the SDK resolves the key from env at the composition
root; the adapters never read it). Both default to model `claude-opus-4-8`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import {
  createAnthropicCommunityAiDraftPort,
  createAnthropicObsAiSuggestionPort
} from "@sanctuary-os/api";

const client = new Anthropic(); // key from ANTHROPIC_API_KEY env
const aiDraftPort = createAnthropicCommunityAiDraftPort({ client });
const aiSuggestionPort = createAnthropicObsAiSuggestionPort({ client });
// …pass aiDraftPort / aiSuggestionPort into the Community+ / OBS persistence
// selection in place of the fake ports.
```

### Live OBS (real obs-websocket control)

The OBS module dispatches confirmed actions through an injected `ObsControlPort`.
It ships a real, obs-websocket-v5-backed adapter
(`createObsWebSocketControlPort`) built on the official `obs-websocket-js` v5 SDK
(the typed client for OBS Studio 28+'s obs-websocket v5), alongside the fake
(`createFakeObsControlPort`) the demo servers and every unit test use. The real
adapter is **unit-tested with an injected fake client AND live-verified** against a
running OBS Studio (v32.1.2, obs-websocket v5) via `pnpm --filter
@sanctuary-os/api obs:smoke` (`apps/api/src/demo/obs-live-smoke.ts`) — it reads
`SANCTUARY_OS_OBS_URL`/`SANCTUARY_OS_OBS_PASSWORD` from `apps/api/.env`, connects an
`OBSWebSocket`, wires the real port into the in-memory OBS service, and switches the
program scene through the request → confirm → dispatch gate (scene-switch only; it
never starts/stops a stream or recording). The demo servers keep using the fake
control port and need no OBS.

**Secret posture (unchanged by going live).** The adapter never reads, stores, or
logs the OBS host/port/password or any streaming-service stream key. The connection
is resolved at the composition root from the access-controlled vault/env and used to
construct and `connect` the `OBSWebSocket` client; the OBS domain records keep only
the opaque `connectionRef` (a vault handle). The adapter operates the
already-connected client — the caller owns connect/auth + secret resolution — and
normalizes every obs-websocket failure to a redacted `ObsControlError` (no host,
port, password, URL, or raw payload in the message).

To wire it live, resolve the connection from the vault/env, connect an
`OBSWebSocket`, and inject the real adapter as the OBS persistence selection's
`controlPort` in place of the fake, behind the existing request → confirm →
dispatch gate (output-affecting actions still require a recorded human
confirmation):

```ts
import OBSWebSocket from "obs-websocket-js";
import { createObsWebSocketControlPort } from "@sanctuary-os/api";

const obs = new OBSWebSocket();
await obs.connect(obsUrl, obsPassword); // url + password from the vault/env, never logged
const controlPort = createObsWebSocketControlPort({ client: obs });
// …pass controlPort into the OBS persistence selection (sql.controlPort) in place
// of the fake control port.
```

`packages/obs-agent` stays a scaffold: the adapter co-locates with its api-owned
port (the `ObsControlPort` contract lives in `apps/api`) to keep the app → package
dependency direction — making the package import the api-owned port would invert it
— exactly as the AI adapters co-locate with their ports rather than living in
`packages/ai-engine`. The package remains a placeholder for the runtime-specific
agent process (the desktop/agent that owns the socket lifecycle).
