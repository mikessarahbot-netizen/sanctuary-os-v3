# API

GraphQL orchestration layer for Sanctuary OS.

## Scaffold contract
- `graphql/` contains schema and resolver surface contracts only.
- `services/` will own role checks, transactions, and cross-aggregate workflows.
- `domain/` will hold pure business rules.
- `integrations/` isolates vendor adapters and normalized errors.
- `auth/` resolves tenant and role context from Auth0 claims.
- `context/` assembles validated ChurchContext projections.
- `events/` publishes validated WebSocket payloads after commits.
- `jobs/` defines async job contracts.

Business logic, database access, and vendor SDK calls are intentionally not implemented in this scaffold.

## Planning persistence boundary

Planning command services depend on the DB package
`PlanningServiceCommandPersistenceRepository` contract. The eventual production
adapter notes live in
[`packages/db/docs/planning-production-adapter-contract.md`](../../packages/db/docs/planning-production-adapter-contract.md).

## Opt-in PostgreSQL integration tests

Default tests are live-DB-free. The Planning and Presenter PostgreSQL integration
smoke tests are skipped unless their module-specific database URL variables are
set.

Run it locally with:

```sh
SANCTUARY_OS_PLANNING_POSTGRES_URL="<local-postgres-url>" pnpm --filter @sanctuary-os/api test:integration:postgres
```

Optional: set `SANCTUARY_OS_PLANNING_POSTGRES_SCHEMA` to a dedicated schema name
matching `[a-z][a-z0-9_]{0,62}`. The smoke test drops and recreates that schema,
applies the Planning migration, exercises the SQL-backed Planning repositories
through API runtime composition, and drops the schema afterward.

To run the Presenter smoke test, set:

```sh
SANCTUARY_OS_PRESENTER_POSTGRES_URL="<local-postgres-url>" pnpm --filter @sanctuary-os/api test:integration:postgres
```

Optional: set `SANCTUARY_OS_PRESENTER_POSTGRES_SCHEMA` to a dedicated schema name
matching `[a-z][a-z0-9_]{0,62}`. The smoke test drops and recreates that schema,
applies the Presenter migration, exercises the SQL-backed Presenter repositories
through API runtime composition, and drops the schema afterward.

Do not commit real database URLs, passwords, tokens, or `.env` files. Checked-in
runtime config stores environment variable names only.
