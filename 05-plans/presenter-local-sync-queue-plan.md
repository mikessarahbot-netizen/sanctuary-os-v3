# Presenter Local Sync Queue Plan

## Purpose

Define the local/offline sync queue boundary for Presenter before desktop implementation begins. The queue lets a loaded presentation keep running locally when API connectivity is degraded or offline, while non-destructive presentation edits are recorded for later replay through the existing API/service command contracts.

## Ownership

| Layer | Owns |
| --- | --- |
| Desktop Presenter | Local run mode, output windows, local queue storage, replay scheduling, conflict status shown to the operator |
| API backend | Saved presentation writes, role checks, tenant scope, durable persistence, event publication after committed writes |
| `packages/db` future local adapter | SQLite-compatible local queue persistence contracts and migrations when implementation begins |
| Event transport | Post-commit realtime notifications only; it does not own local queue replay |

## Queued Edit Scope

Queue only non-destructive Presenter edits that already have service command contracts:

- `updatePresentation`
- `addSlide`
- `updateSlide`
- `reorderSlides`
- `applyPresenterTheme`
- `setOutputTarget`

Do not queue these in the first implementation:

- `createPresentationFromService`, because service import may depend on fresh Planning data.
- `removeSlide`, because it is destructive and requires explicit confirmation at execution time.
- Stream start/stop, OBS automation, raw media uploads, Bible API requests, AI slide generation, or vendor SDK calls.
- Local run-mode actions (`loadPresentation`, `goToSlide`, `nextSlide`, `previousSlide`, `blankOutput`, `restoreOutput`, `toggleConfidenceOutput`), because they are local operational state, not saved presentation writes.

## Queue Record Shape

Each queued edit should be Zod-validated before storage and before replay.

| Field | Purpose |
| --- | --- |
| `queueEntryId` | Opaque local ID for queue ordering and UI status |
| `tenantId` | Required tenant scope; must match actor and payload tenant/presentation scope |
| `presentationId` | Aggregate being edited; used for replay grouping and conflict checks |
| `actorId` | Required audit actor for eventual API command replay |
| `requestId` | Stable request ID generated when the local edit is queued; reused during replay for idempotency |
| `queuedAt` | Local ISO timestamp for ordering |
| `lastAttemptedAt` | Optional ISO timestamp for retry state |
| `attemptCount` | Non-negative integer |
| `baseRevision` | Last known server revision or event sequence when the edit was queued |
| `operation` | Discriminated queued operation name from the approved edit scope |
| `payload` | Existing Presenter command input payload for that operation |
| `status` | `queued`, `replaying`, `synced`, `conflict`, `failed`, or `cancelled` |
| `conflict` | Optional conflict details when replay cannot be applied cleanly |
| `safeErrorMessage` | Optional redacted user-facing failure message |

The queue must not store Auth0 tokens, API credentials, vendor tokens, raw media bytes, raw display-manager payloads, raw AI prompts, or PII beyond the actor ID already required for audit metadata.

## Conflict States

| State | Meaning | Operator path |
| --- | --- | --- |
| `queued` | Stored locally and waiting for API connectivity | No action required |
| `replaying` | Currently being sent through API command contracts | Show progress only |
| `synced` | API accepted the command and server state/event stream caught up | Remove or archive locally after retention window |
| `conflict` | Server presentation changed since `baseRevision`, or replay response does not match expected aggregate scope | Show review UI before retrying |
| `failed` | Retryable transport/server failure after policy limits, or validation failed before replay | Show safe error and keep local run mode available |
| `cancelled` | Operator intentionally discarded the local edit before successful replay | Keep audit-light local record until retention cleanup |

Conflict details should include:

- `serverRevision`
- `localBaseRevision`
- `conflictKind`: `stale-presentation`, `missing-slide`, `theme-mismatch`, `output-target-mismatch`, `validation-failed`, or `authorization-failed`
- `safeMessage`

## Replay Rules

- Replay entries in `queuedAt` order per `presentationId`.
- Validate each queue entry before replay and reject malformed entries without calling the API.
- Rebuild the existing Presenter service command shape with actor and request scope; do not call DB repositories directly from desktop queue replay.
- Stop replay for a presentation when an entry enters `conflict` or non-retryable `failed`; later entries for the same presentation must wait.
- Retry transport failures with backoff and an attempt limit; keep local run mode usable while retrying.
- Treat validation, authorization, tenant mismatch, destructive-operation attempts, and stale revision errors as non-automatic conflicts.
- Mark an entry `synced` only after the API command succeeds and the returned aggregate/event scope matches the queue entry tenant and presentation.

## Tenant And Audit Metadata

- Every queue entry must include `tenantId`, `actorId`, `requestId`, `presentationId`, and `queuedAt`.
- Replay must preserve the original `requestId` for idempotency and audit correlation.
- Queue entries must not infer tenant from IDs. Payload tenant fields, when present, must match `tenantId`.
- Local queue records are operational metadata; API audit records remain the source of truth for committed saved-presentation changes.

## Storage Expectations

The first implementation should add contracts before SQLite persistence. SQLite/local storage work should:

- Keep IDs as opaque strings.
- Store operation and payload as validated JSON with schema version.
- Index by `tenantId`, `presentationId`, `status`, and `queuedAt`.
- Avoid PostgreSQL-only semantics so local storage remains portable.
- Include stale-data and sync-queue tests before desktop replay code depends on it.

## Validation Expectations

The contract slice that follows this plan should test:

- Accepted queued operation shapes for the approved edit scope.
- Rejection of destructive operations, OBS/stream controls, raw media, vendor tokens, secrets, and unknown fields.
- Tenant/presentation/actor/request metadata requirements.
- Queue status transitions, including no regression from terminal states.
- Conflict detail validation.
- Replay readiness ordering by tenant, presentation, status, and queued timestamp.

## First Implementation Acceptance

- Strict Zod schemas and exported types exist for queue entries, queued operations, conflict details, and status transitions.
- Tests cover approved operations, forbidden operations, tenant/audit metadata, conflict states, retry metadata, and secret/raw payload rejection.
- No production queue runner, SQLite migration, desktop UI, Tauri command, desktop event bus, OBS/stream automation, vendor SDK, Auth0 integration, AI execution, deployment config, or checked-in secret is introduced.
- Existing lint, typecheck, and test gates pass.
