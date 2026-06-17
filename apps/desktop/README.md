# desktop

Prepared for future work.

## Presenter output-window contracts

Presenter desktop work starts from the shared Presenter domain contracts in
`apps/api/src/domain/presenter/`. Those contracts validate local run-mode status,
desktop output-window state, and active-slide render contexts without creating
real windows, starting a desktop event bus, controlling OBS, starting/stopping
streams, or carrying raw media/secret payloads.
