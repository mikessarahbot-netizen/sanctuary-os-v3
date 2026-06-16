# DB

Persistence boundary contracts for Sanctuary OS.

## Scaffold contract
- Defines tenant-scoped database operation context.
- Defines migration and transaction contract shapes.
- Supports future PostgreSQL server persistence and SQLite local/offline persistence.
- Does not choose an ORM, query builder, or migration tool.
- Does not include migrations, generated clients, connection strings, or schema implementation.

All persisted reads and writes must be tenant-scoped before this package gains concrete adapters.

## Planning contracts

- [Planning production adapter contract](docs/planning-production-adapter-contract.md)
  documents the eventual production database adapter boundary for
  `PlanningServiceCommandPersistenceRepository`.
