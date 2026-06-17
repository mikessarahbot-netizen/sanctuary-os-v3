# NOW

## Milestone reached
The **Charts and Play API/db backends are both complete** end-to-end (Charts slices 1–7b; Play slices 1–9), all green and pushed at `583f3ef`. Gates: db 347 · api 402 (+2 skipped) · desktop 54 · church-context 5. See `07-reviews/architecture/play-backend-release-check.md`.

## Decision point — next direction (the real fork)
Everything built so far is backend; nothing is runnable as a UI yet. Choose the next direction:

1. **Pivot to a runnable surface (recommended).** Build ONE module (Charts or Play) end-to-end including a UI, so there is an app you can open. This requires choosing the app-shell approach — and they differ in how autonomously verifiable they are:
   - **Web (`apps/web`, Next.js)** — most autonomously verifiable (can be loaded + screenshotted via the preview/browser tools), but `apps/web` role vs the desktop/mobile product surfaces should be confirmed.
   - **Desktop (`apps/desktop`, Tauri)** — product-aligned (the operator surface; the Tauri shell + Node sidecar already exist), but the webview UI is hard to verify without a human/screenshot.
   - **Mobile (`apps/mobile`, Expo)** — product-aligned for volunteers, but a bare workspace needing a full Expo scaffold; unit-verifiable only.
2. **Continue backend-first.** Play slice 10 (desktop replay runtime) + then author the Community+ module plan and build its backend, then OBS. More foundation; still nothing runnable for a long while.

## Session protocol (in force)
`agents.md` › "Session continuity protocol": commit + push at clean breakpoints. Handoff = the module plans + this NOW.md + `docs/session-summary.md`. The live `/goal` hook forces continuation; building under it with safe commits/pushes at every breakpoint.

## If proceeding autonomously
Reality found: `apps/web` and `apps/mobile` are bare (README only); `apps/desktop` is all Node sidecar/runtime with no webview UI. So a UI on any surface is a large from-scratch frontend and is NOT autonomously gate-verifiable (Tauri/Expo can't be headlessly screenshotted; a web app is previewable but `apps/web`'s product role is unconfirmed). Therefore:
- **If the user picks a surface** (web / desktop / mobile): build the smallest end-to-end Charts screen there (list → open → render) wired to the GraphQL API, with component/hook tests + gates green — verified at unit level (visual confirmation needs the user).
- **If hands-off (hook keeps forcing continuation):** keep producing GATE-VERIFIABLE value instead of an unverifiable UI — finish Play slice 10 (the desktop replay *runtime*: a Node sidecar mirroring the presenter desktop runtime, which IS unit-verifiable), then author the Community+ module plan and build its backend, then OBS. Return to UIs once the user can pick a surface + eyeball it.

## Deferred / tracked
- Play slice 10 (desktop replay runtime) — pairs with the desktop UI.
- UI slices (Charts + Play) — this decision.
- Community+ and OBS modules — not yet started (each: plan → backend slices → UI).
- GraphQL enum mismatch — background task `task_85338bf7`.
