# NOW

## Task
Add Presenter desktop run-mode/output-window contracts.

## In scope
- Continue on `feature/presenter-domain-contracts`
- Re-sync with `agents.md`, `docs/session-summary.md`, `00-product/vision.md`, `01-architecture/system-map.md`, `02-standards/engineering-rules.md`, `05-plans/presenter-module-plan.md`, `07-reviews/architecture/presenter-event-transport-release-check.md`, and current Presenter domain contract/tests
- Extend Presenter contracts for desktop-owned run-mode/output-window boundaries, preserving local fail-safe playback and tenant scope
- Cover output window identity, output role/kind, safe blank state, confidence output eligibility, active slide rendering context, and local/offline status metadata with strict Zod schemas
- Add or update focused tests for valid desktop output-window/run-mode contract parsing, tenant mismatch rejection, active slide validation, safe blank/confidence behavior, and rejection of OBS/stream/raw-media/secret-like fields
- Document the contract boundary briefly where the existing module docs/readme expect it
- Run the lightest reliable focused tests plus lint, typecheck, and full tests if the shared contract surface changes
- Commit and push the slice
- Run session handoff

## Out of scope
Desktop UI screens · real output window creation · Tauri commands · desktop event bus wiring · production WebSocket/SSE adapters · raw media storage · Bible API integration · OBS control · stream start/stop · vendor SDKs · Auth0 integration · AI prompt execution · production deployment config · checked-in secrets · browser/client implementation

## Progress
- [x] Re-sync with required docs and current Presenter contracts
- [x] Design the smallest desktop run-mode/output-window contract extension
- [x] Implement strict schemas/types and parser helpers
- [x] Add focused contract tests
- [x] Update lightweight boundary docs
- [x] Run validation
- [ ] Commit and push slice
- [ ] Session handoff

## Done when
Presenter desktop run-mode/output-window contracts are Zod-validated, tested, documented, committed, pushed, and handoff documents identify the exact next task.

## Next task after this
Run a focused release check for Presenter desktop run-mode/output-window contracts, or continue to local sync queue planning if validation is clean.
