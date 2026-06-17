# ADR 0006: Ship the Desktop Presenter Sidecar as a Node SEA Binary

## Status
Accepted

## Date
2026-06-17

## Context
The Presenter desktop app runs its offline-sync replay runtime in a Node sidecar (ADR 0005), bundled by esbuild to `apps/desktop/dist/presenter-sidecar.mjs`. The Tauri Rust shell spawns it with `node <bundle>` and supervises it. During development a system `node` is available, but a distributed app cannot assume one is installed, of a compatible version, or that `node:sqlite` (the synchronous SQLite engine the runtime depends on) is present.

The sidecar therefore needs a self-contained runtime to ship. Options:

1. **Require a system `node`** — simplest, but unacceptable for distribution (no install guarantee, wrong version, missing `node:sqlite`).
2. **Bundle a full Node distribution** alongside the app and run `node <bundle>` — works, but ships a large tree and complicates path resolution and signing.
3. **Node Single Executable Application (SEA)** — compile the esbuild bundle into one self-contained executable embedding the Node runtime, shipped as a Tauri external binary (sidecar). One signed artifact per target, no system `node`.
4. **Rewrite the runtime for an async webview SQLite** (Tauri SQL plugin) — rejected in ADR 0005; would discard the synchronous storage layer and all its tests.

## Decision
Ship the sidecar as a Node SEA single-executable binary, embedding the esbuild bundle and the Node runtime (which provides `node:sqlite`). It is declared as a Tauri external binary (`bundle.externalBin` / sidecar) so Tauri packages and signs it per target triple, and the Rust shell resolves `SANCTUARY_OS_PRESENTER_SIDECAR_PATH` from the app's bundled resources, falling back to a system `node <bundle>` only in development.

## Consequences
- A distributed app carries no system-`node` dependency; `node:sqlite` ships with the embedded runtime.
- A CI step must produce the SEA binary per platform (build the bundle, run the Node SEA blob/inject flow, name it with the Tauri target-triple suffix) and place it where `externalBin` expects it.
- The Node version is pinned to the one used to build the SEA, so `node:sqlite` availability is deterministic.
- The Rust shell keeps the env-guarded spawn; only the path resolution (resources vs. dev `node`) changes.
- Larger per-platform artifacts than a shared system Node, accepted for self-containment and signing simplicity.
- If a future requirement removes the synchronous-SQLite constraint, revisit toward an in-webview engine (ADR 0005's rejected option).

## Follow-Ups
- Add a `build:sidecar:bin` step (Node SEA) and wire the produced binary into `tauri.conf.json` `bundle.externalBin`.
- Resolve the sidecar path from app resources in `apps/desktop/src-tauri/src/lib.rs`, with the dev `node <bundle>` fallback.
- Add the per-platform SEA build to CI before `tauri build`.
