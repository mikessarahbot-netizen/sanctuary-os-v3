# NOW

## CAPSTONE: the product RUNS end-to-end (web → live GraphQL API), visually verified
The whole stack is runnable and was verified live:
- `apps/web` (Vite + React + strict TS) — a Charts read surface (library list + a detail view rendering ChordPro with chords above lyrics). Committed `1b8b99d`.
- `apps/api/src/demo/server.ts` — a runnable demo API (`pnpm --filter @sanctuary-os/api dev`, tsx, :4000) composing the full executable schema (all 5 modules' in-memory services + fakes) behind a demo auth context + seeded charts; the web app reaches it through a Vite `/graphql` proxy (no CORS) with a demo bearer token. A gate test boots it over HTTP and round-trips a query + a mutation. Committed `2bb18fc`.
- VERIFIED LIVE via the preview tools: started both servers, loaded the web app in live mode ("LIVE DATA" badge), and screenshotted the seeded charts + the Amazing Grace ChordPro detail — all fetched from the running GraphQL API down through the resolvers → in-memory services → seeded data.

So: an earlier wrong assumption is corrected — **web UIs ARE autonomously verifiable** (component tests + dev-server screenshots), and the **full vertical works**. The web UI layer is a verifiable, autonomously-buildable path.

Full CRUD is now proven: a Charts edit/save write path (`d3deafa`) was verified live (edited ChordPro in the UI → live `updateChartSource` mutation → re-rendered AND persisted server-side, confirmed by re-querying the API).

Remaining web work (all verifiable the same way): deepen Charts (transpose, arrangements/annotations), then Play / Community+ / OBS web surfaces (the demo server already serves all of them); broaden the seed. Still genuinely needing the user: the DESKTOP (Tauri) + MOBILE (Expo) native operator surfaces, and the live EXTERNAL integrations (real obs-websocket, comms carrier) — credentials/connections.

Run it yourself: terminal 1 `pnpm --filter @sanctuary-os/api dev`; terminal 2 `pnpm --filter @sanctuary-os/web dev`; open http://127.0.0.1:5173/?source=live.

## MILESTONE: the autonomously-buildable backend is COMPLETE

All four module backends — **Charts, Play, Community+, OBS** — are complete end-to-end, plus the pre-existing Planning + Presenter work. All green and pushed at `b17b20e`.

Gates: **db 466 · api 828 (+2 skipped) · desktop 89 · church-context 5** · lint clean · all 4 projects typecheck.

Per-module backend release checks in `07-reviews/architecture/`:
- `charts-*`, `play-backend-release-check.md`, `community-backend-release-check.md`, `obs-backend-release-check.md`.

What's built per module: domain + pure logic → persistence contracts → migration → SQLite adapter → GraphQL + in-memory service → persistence-backed service → offline-sync queue + replay (Charts/Play) → events → AI assist; plus the desktop replay runtimes (Presenter, Play) and the OBS control-port gate. Privacy/safety holds throughout (no PII to AI / PII-free projections; no secrets in records; human-confirm gates for comms send + OBS stream/scene; tenant scope everywhere).

## The two autonomously-verifiable cleanups are now DONE
- ✅ Cross-module GraphQL enum hyphen/underscore fix — Charts/Play enum value maps added; values round-trip; `3b56010` (resolved task_85338bf7).
- ✅ Network-executor `$input: JSON!` gap — desktop presenter+play replay now use typed-input documents (canonical maps in `@sanctuary-os/api`, imported by desktop), validated against the executable schema by a new api test with a negative control; `0f9f575`.

With these, **the autonomously-buildable, gate-verifiable work is complete.** There is nothing left I can build AND verify without you.

## The remaining Sanctuary OS work — ALL of it needs the user
This is the honest frontier. None of it is autonomously gate-verifiable; each needs a decision and/or visual verification only the user can give:

1. **UIs for every module** (Charts, Play, Community+, OBS) — `apps/web` + `apps/mobile` are bare; `apps/desktop` is Node-runtime-only (no webview UI). A UI on any surface is a from-scratch frontend + a surface/scaffold decision + visual verification.
2. **Live integrations:**
   - Real obs-websocket v5 client in `packages/obs-agent` (OBS slice 11) — needs an OBS connection + a vault/secret-store decision.
   - The comms send carrier (Community+ slice 11) — needs a carrier/account decision.
   - Desktop/mobile app shells + wiring the replay runtimes / OBS agent to live transports.

## Decision for the user (the build can't meaningfully continue autonomously without this)
Pick a direction:
- **"runnable: <surface>"** (web / desktop / mobile) → I build one module's UI end-to-end against the live GraphQL API, with you doing the visual check.
- **a specific integration** (e.g. "wire real obs-websocket") → I'll need the connection/account/vault details.
- **"stop"** → review the complete backend on `feature/presenter-domain-contracts`.

## Session protocol (in force)
`agents.md` › "Session continuity protocol". Everything is committed + pushed; a fresh session can resume from this NOW.md + the module plans + `docs/session-summary.md`.
