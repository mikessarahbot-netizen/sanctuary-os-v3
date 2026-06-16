# ADR 0002: Defer Database Adapter and Migration Tool Choice

## Status
Accepted

## Date
2026-06-16

## Context
The scaffold sequence includes `packages/db`, but there is no `05-plans/db-plan.md`. The stack names PostgreSQL and SQLite, while the current active task excludes database implementation and migrations.

## Decision
Scaffold `packages/db` as persistence boundary contracts only. Do not choose an ORM, query builder, migration tool, connection pool, or schema layout in this layer.

## Consequences
- The scaffold can enforce tenant-scoped operation contracts without writing database code.
- Future implementation can choose the adapter and migration strategy from an explicit plan.
- No dependency on a database server is introduced during scaffolding.
