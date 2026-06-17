# ADR 0005: Desktop Presenter Replay Runs in a Node Context Using node:sqlite

## Status
Accepted

## Date
2026-06-17

## Context
The Presenter desktop offline-sync runtime persists its local sync queue through a synchronous SQLite client (`SqliteMigrationDatabaseClient`: `prepare`/`exec`/`run`/`all` return values directly, not promises). This shape matches `node:sqlite` (`DatabaseSync`) and `better-sqlite3`, and the executor, migration runner, persistence composition, replay pass, scheduler, and runtime assembly are all built on it and fully tested.

The desktop app shell is Tauri 2 (now scaffolded and compiling). A Tauri webview is a browser context where SQLite is only reachable asynchronously through the Tauri SQL plugin (IPC to Rust). Running the existing synchronous runtime directly in the webview is therefore impossible without either:

1. Refactoring the SQLite client interface from synchronous to asynchronous (promise-returning `prepare`/`exec`/`run`/`all`), which ripples through the executor, migration runner, composition, and every test and smoke; or
2. Running the runtime in a Node context that provides a synchronous SQLite engine, and letting the Tauri shell talk to it.

## Decision
Run the Presenter desktop replay runtime in a Node context using `node:sqlite`, reusing the existing synchronous `SqliteMigrationDatabaseClient` unchanged. The Tauri shell spawns this runtime as a sidecar process; the webview UI communicates with the sidecar (status, operator actions) rather than executing SQLite itself.

The runtime bootstrap (`createPresenterDesktopRuntimeBootstrap`) accepts an injected `SqliteMigrationDatabaseClient`, fetch transport, auth-token provider, and connectivity check, so it stays engine- and transport-agnostic and testable; the sidecar entry supplies the concrete `node:sqlite` client.

## Consequences
- No async refactor of the SQLite client, executor, or migration runner is required; all existing tests and `node:sqlite` smokes remain valid.
- The desktop app gains a Node sidecar process to package and supervise (start/stop, crash recovery) when the Tauri shell wiring is built.
- `node:sqlite` requires a recent Node runtime; `better-sqlite3` remains a drop-in alternative for the same client shape if a specific Node version is unavailable.
- The Tauri webview never accesses SQLite directly, so the Tauri SQL plugin is not a dependency. If a future requirement forces all logic into the webview, revisit with the async-client refactor (option 1).
