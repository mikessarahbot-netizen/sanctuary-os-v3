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
Default per the user's "continue at your discretion": pivot toward a runnable surface, choosing the most verifiable viable option (web preview if `apps/web` is an acceptable first surface; otherwise the desktop operator surface accepting limited autonomous verification). Build the smallest end-to-end Charts surface first (list track sets/charts → open one → render), wired to the GraphQL API, with component/hook tests + gates green, then verify it actually loads.

## Deferred / tracked
- Play slice 10 (desktop replay runtime) — pairs with the desktop UI.
- UI slices (Charts + Play) — this decision.
- Community+ and OBS modules — not yet started (each: plan → backend slices → UI).
- GraphQL enum mismatch — background task `task_85338bf7`.
