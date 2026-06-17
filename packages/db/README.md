# DB

Persistence boundary contracts for Sanctuary OS.

## Contract
- Defines tenant-scoped database operation context.
- Defines migration and transaction contract shapes.
- Supports future PostgreSQL server persistence and SQLite local/offline persistence.
- Uses explicit SQL migration artifacts and PostgreSQL adapter boundaries for
  Planning server persistence.
- Does not include generated clients, connection strings, or checked-in secret
  values.

All persisted reads and writes must be tenant-scoped before this package gains concrete adapters.

## Planning contracts

- [Planning production adapter contract](docs/planning-production-adapter-contract.md)
  documents the eventual production database adapter boundary for
  `PlanningServiceCommandPersistenceRepository`.

## PostgreSQL integration coverage

The opt-in live PostgreSQL smoke tests for Planning and Presenter runtime
composition live in the API package because API composition owns runtime
selection. See
[`apps/api/README.md`](../../apps/api/README.md).
