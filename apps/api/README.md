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
