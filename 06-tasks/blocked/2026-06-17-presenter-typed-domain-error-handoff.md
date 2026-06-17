# Presenter Typed Domain Error Handoff

Date: 2026-06-17  
Branch: `feature/presenter-domain-contracts`

Status: Not blocked.

`PresenterDomainError` and the GraphQL transport conflict-code mapping are complete and pushed (`b05b30f`); release check at `07-reviews/architecture/presenter-typed-domain-error-release-check.md` (pass with follow-ups). All four workspaces are green (db 140, api 218 + 2 skipped, desktop 42, church-context 5).

This closes the offline replay conflict round-trip: a Presenter service that throws `PresenterDomainError` now produces `errors[].extensions.code`, which the desktop replay classifier maps to a `conflict` entry. The codes match the desktop classifier exactly.

The Presenter local sync queue offline-edit feature is now built end to end across all four workspaces — storage, replay decision, API coordinator/executor, desktop runtime + adapters + bootstrap + sidecar, a compiling Tauri shell, the API GraphQL execution layer + transport, and the typed-error conflict round-trip.

Remaining (all documented, none blocking):
1. Bind the GraphQL handler to a concrete Node `http` listener (the current active task) so the API serves requests.
2. Wire the Presenter service to throw `PresenterDomainError` per real condition (revision tracking, slide existence) with tests.
3. Desktop tail: process `main`, Tauri sidecar spawn/supervision, minimal status UI.

Open questions:
- None blocking.
