# DB Tooling ADR Handoff

Date: 2026-06-16
Branch: `feature/planning-readiness-domain`

## Status
No blockers.

## Notes
- ADR 0003 chooses a SQL-first PostgreSQL adapter with explicit repo-owned SQL migrations for first Planning production persistence.
- Next task is to add adapter-free migration framework tests and the initial Planning schema migration shape under `packages/db`.
