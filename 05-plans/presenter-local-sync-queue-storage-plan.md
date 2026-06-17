# Presenter Local Sync Queue Storage Plan

## Purpose

Define the local persistence boundary for the Presenter local sync queue before SQLite-backed storage or desktop replay code is implemented. This plan turns the validated queue contracts from `05-plans/presenter-local-sync-queue-plan.md` into storage expectations that can be tested without adding production queue runners, Tauri wiring, desktop UI, or concrete database adapters in this slice.

## Ownership

| Layer | Owns | Does not own |
| --- | --- | --- |
| Desktop Presenter | Deciding when local edits are queued, surfacing queue status to operators, and invoking future replay scheduling | Direct database schema details, API service authorization, event publication |
| Future local storage adapter | SQLite-compatible queue tables, persistence contract implementation, migrations, tenant-scoped lookups, retention cleanup primitives | Presentation command validation beyond imported queue schemas, network replay, desktop windows |
| API backend | Saved presentation command handling, role checks, tenant scope, durable server persistence, idempotent request handling, post-commit events | Local queue storage files, SQLite migrations, desktop replay scheduling |
| `packages/db` | Shared persistence contracts, migration artifacts, adapter tests, SQLite-compatible SQL shape when implementation starts | GraphQL resolvers, Auth0 claims parsing, vendor SDK calls, raw media storage |

## Storage Record Boundary

Every stored queue record must be validated with `PresenterLocalSyncQueueEntrySchema` before insert/update and after read. Storage may add persistence metadata, but it must not change the queued operation contract.

Required stored fields:

| Field | Storage expectation |
| --- | --- |
| `queueEntryId` | Primary local queue identity; opaque string generated before insert |
| `tenantId` | Required index column; every read/write filters by tenant explicitly |
| `presentationId` | Required index column for replay ordering and conflict blocking |
| `status` | Required index column using the queue status enum |
| `queuedAt` | Required ISO timestamp text for deterministic ordering |
| `lastAttemptedAt` | Nullable ISO timestamp text; allowed only when `attemptCount > 0` |
| `attemptCount` | Non-negative integer with default `0` at queue time |
| `actorId` | Required audit actor ID preserved for API replay |
| `requestId` | Stable idempotency key reused for every replay attempt |
| `baseRevision` | Last known server revision when the edit was queued |
| `operation` | Approved queued operation name for indexed inspection/debugging |
| `payloadJson` | Canonical JSON for the full validated queued operation |
| `conflictJson` | Nullable JSON for validated conflict details only when status is `conflict` |
| `safeErrorMessage` | Nullable redacted user-facing text only when status is `failed` |
| `schemaVersion` | Queue storage schema version, starting at `presenter-local-sync-queue.v1` |
| `createdAt` | Local ISO timestamp for insertion audit |
| `updatedAt` | Local ISO timestamp updated on status/retry/conflict changes |

Forbidden stored fields:

- Auth0 access tokens, refresh tokens, cookies, session secrets, API credentials, vendor tokens, Bible API keys, OBS connection secrets, raw media bytes, raw display-manager payloads, raw AI prompts, volunteer contact details, prayer/counseling notes, giving data, or any unvalidated external payload.
- Desktop-only run-mode actions such as `goToSlide`, `blankOutput`, or confidence-output toggles.
- Destructive saved-presentation operations such as `removeSlide`.

## SQLite Shape

The first SQLite implementation should use a single queue table unless tests prove that a split table is necessary.

Recommended table: `presenter_local_sync_queue_entries`

Required indexes:

- Unique primary key on `queue_entry_id`.
- Replay index on `(tenant_id, presentation_id, status, queued_at, queue_entry_id)`.
- Status dashboard index on `(tenant_id, status, updated_at)`.
- Request idempotency index on `(tenant_id, request_id)`.

Required constraints:

- `attempt_count >= 0`.
- `status` is one of `queued`, `replaying`, `synced`, `conflict`, `failed`, or `cancelled`.
- `operation` is one of the approved queued operation names.
- `payload_json` is non-empty text.
- `conflict_json` is nullable at the SQL layer but must be present only for `conflict` after Zod validation.
- `safe_error_message` is nullable at the SQL layer but must be present only for `failed` after Zod validation.

Use text timestamps and opaque string IDs so the storage remains portable. Do not require PostgreSQL-only JSON, enum, generated-column, lock, or partial-index semantics for the public adapter contract.

## Migration Expectations

The implementation slice that adds SQLite storage must include migration artifacts before adapter behavior depends on the table.

Migration requirements:

- Stable migration ID and checksum through the existing migration artifact pattern.
- Forward SQL for table and indexes.
- Rollback SQL that drops indexes and the table.
- Migration tests that assert table name, required columns, status/attempt constraints, replay/idempotency indexes, checksum stability, and rollback SQL.
- No connection strings, secrets, deployment config, or live database requirement in default tests.

If a local SQLite migration runner is needed, create its contract separately from this plan before wiring it into the desktop app.

## Repository Contract Expectations

The first storage contract should expose small operations that map directly to queue lifecycle behavior:

| Operation | Expected behavior |
| --- | --- |
| `enqueue(entry)` | Validate the entry, require `queued` status, insert with schema version and timestamps |
| `getById(context, queueEntryId)` | Tenant-scoped lookup returning a validated entry or not found |
| `listReadyForReplay(context, presentationId?)` | Return validated `queued` entries in contract replay order |
| `markReplaying(context, transition)` | Apply only allowed `queued -> replaying` transition |
| `markSynced(context, transition)` | Apply only allowed `replaying -> synced` transition |
| `markConflict(context, transition, conflict)` | Store validated conflict details and stop later replay for that presentation |
| `markFailed(context, transition, safeErrorMessage)` | Store redacted safe error text and retry metadata |
| `requeue(context, transition)` | Apply allowed retry transition and preserve original `requestId` |
| `cancel(context, transition)` | Apply allowed cancellation transition for operator-discarded edits |
| `cleanupSyncedAndCancelled(context, olderThan)` | Remove or archive terminal local records after retention |

Each operation must require explicit `tenantId` in the context and must not infer tenant scope from IDs. Returned entries must validate against `PresenterLocalSyncQueueEntrySchema`.

## Replay And Idempotency Metadata

The storage adapter must preserve replay metadata exactly:

- `requestId` never changes after enqueue and is reused for API replay attempts.
- `baseRevision` never changes for the queued operation; conflict resolution may enqueue a new entry with a new base revision.
- `attemptCount` increments only when a replay attempt is made.
- `lastAttemptedAt` is updated with each replay attempt.
- `queuedAt` remains the original queue time for ordering.
- `updatedAt` changes on every persisted status, retry, conflict, or cancellation update.

The future replay service should treat `(tenantId, requestId)` as the local idempotency key. API command handlers remain responsible for server-side idempotency once production replay support is introduced.

## Stale Data And Conflict Handling

The storage layer must make conflicts durable and reviewable:

- A stale server revision, missing slide, tenant mismatch, authorization failure, validation failure, theme mismatch, or output-target mismatch stores a `conflict` status with validated conflict details.
- Later queued entries for the same tenant and presentation must not be returned for automatic replay while an earlier entry is `conflict` or non-retryable `failed`.
- Conflict records keep their original payload and `baseRevision` so the operator can compare local intent with server state.
- Conflict resolution should produce a new validated queue entry or cancel the conflicted entry; do not mutate the original payload into a different operation.

## Retry And Retention Behavior

Retry policy belongs to the replay service, but storage must support it safely:

- Store retry metadata without storing raw server errors.
- Persist only redacted `safeErrorMessage` values.
- Preserve failed records until an operator retries/cancels or retention cleanup removes terminal entries.
- Retain `synced` and `cancelled` records for a short local audit window, then cleanup by tenant and timestamp.
- Never block local run mode because cleanup fails.

## Tenant Isolation And Privacy

- Every storage API requires `tenantId`.
- Every query filters by `tenantId`.
- Every returned row must include the requested tenant ID and validate after mapping.
- No queue table or adapter log may include secrets, raw PII, raw AI prompts, raw media payloads, or vendor credentials.
- Actor IDs are permitted because the queue needs audit correlation for eventual API replay.

## Test Expectations For Implementation

The storage implementation slice must add tests for:

- Enqueue validation and rejection of malformed or forbidden operations.
- Tenant-scoped reads, misses, and cross-tenant rejection.
- Replay ordering by tenant, presentation, `queuedAt`, and `queueEntryId`.
- Blocking later replay entries behind a conflict or non-retryable failed entry for the same presentation.
- Allowed and forbidden status transitions.
- Retry metadata increments and timestamp updates.
- Preservation of `requestId`, `baseRevision`, and original payload across replay attempts.
- Redacted failure storage and rejection of secret-like fields.
- Migration shape, indexes, rollback SQL, and checksum stability.
- Default validation without live SQLite, network access, Auth0, vendor SDKs, OBS, stream control, or desktop event-bus wiring.

## First Storage Implementation Acceptance

- A local queue repository contract and tests exist before desktop replay depends on persistence.
- SQLite migration artifacts and migration tests exist before adapter code writes queue records.
- All queue entries are Zod-validated before storage and after read.
- Tenant isolation, replay ordering, stale-data blocking, retry metadata, conflict details, safe error persistence, and idempotency metadata are covered by tests.
- No production queue runner, concrete desktop UI, Tauri command, live event bus, WebSocket server wiring, GraphQL/API coupling change, OBS/stream action, raw media storage, AI execution, vendor SDK, Auth0 integration, deployment config, or checked-in secret is introduced.
