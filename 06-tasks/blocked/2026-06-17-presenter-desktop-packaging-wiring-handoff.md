# Presenter Desktop Packaging Wiring Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

The desktop packaging wiring is complete and pushed (`8b00413`); release check `07-reviews/architecture/presenter-desktop-packaging-wiring-release-check.md` (pass with follow-ups). All four workspaces are green (db 143, api 230 + 2 skipped, desktop 54, church-context 5); `cargo check` compiles.

The Tauri build now runs `build:sidecar`, the shell defaults the sidecar status port, and the webview reads a matching configurable port — so a built app self-wires.

**The Presenter offline-sync feature is complete end to end** as a launchable, conflict-resolving desktop app across `packages/db`, `apps/api`, `apps/desktop` (+ Tauri shell), all gate-tested with `node:sqlite` smokes, `cargo check`, and a building sidecar bundle.

Remaining:
1. **Node-runtime packaging ADR** (current active task) — document how the sidecar ships for distribution (bundled Node / Node SEA single-executable) so a built app does not depend on a system `node`. Then the binary packaging + CI is a follow-on.
2. **Next module** — Play, Charts, Community+, and OBS have no plan in `05-plans/` (only Planning and Presenter do). Each needs a module plan authored from `00-product/vision.md` + `01-architecture/system-map.md` before slice-by-slice implementation. This is a product-scope step.

Open questions:
- Which module is the next priority, and should its plan be authored before implementation? (Plan-driven discipline says yes.)
