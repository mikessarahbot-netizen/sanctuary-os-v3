import { describe, expect, it } from "vitest";
import {
  createPresenterLocalSyncQueueSqlRepository,
  type PlanningSqlQueryResult,
  type PlanningSqlRow,
  type PlanningSqlStatement,
  type PlanningSqlValue,
  type PresenterLocalSyncConflictDetailPersistence,
  type PresenterLocalSyncQueueEntryPersistenceRecord
} from "./index.js";

const tenantId = "tenant_1";
const queuedAt = "2026-06-17T01:00:00.000Z";
const updatedAt = "2026-06-17T01:00:00.000Z";
const transitionedAt = "2026-06-17T02:00:00.000Z";

interface RecordingSqlExecutor {
  readonly query: (statement: PlanningSqlStatement) => Promise<PlanningSqlQueryResult>;
  readonly statements: readonly PlanningSqlStatement[];
}

const createRecordingExecutor = (
  resultSets: readonly (readonly PlanningSqlRow[])[]
): RecordingSqlExecutor => {
  const statements: PlanningSqlStatement[] = [];
  const queuedResults = [...resultSets];

  return {
    get statements(): readonly PlanningSqlStatement[] {
      return statements;
    },
    query: (statement): Promise<PlanningSqlQueryResult> => {
      statements.push(statement);

      return Promise.resolve({ rows: queuedResults.shift() ?? [] });
    }
  };
};

const baseQueuedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
  actorId: "actor_1",
  attemptCount: 0,
  baseRevision: "revision_4",
  createdAt: queuedAt,
  operation: {
    operation: "updatePresentation",
    payload: {
      presentationId: "presentation_1",
      title: "Sunday Gathering"
    }
  },
  presentationId: "presentation_1",
  queuedAt,
  queueEntryId: "queue_entry_1",
  requestId: "request_1",
  schemaVersion: "presenter-local-sync-queue.v1",
  status: "queued",
  tenantId,
  updatedAt
};

const canonicalOperationJson =
  '{"operation":"updatePresentation","payload":{"presentationId":"presentation_1","title":"Sunday Gathering"}}';

const toStoredRow = (
  entry: PresenterLocalSyncQueueEntryPersistenceRecord,
  overrides: Readonly<Record<string, unknown>> = {}
): PlanningSqlRow => ({
  actor_id: entry.actorId,
  attempt_count: entry.attemptCount,
  base_revision: entry.baseRevision,
  conflict_json: entry.conflict === undefined ? null : JSON.stringify(entry.conflict),
  created_at: entry.createdAt,
  last_attempted_at: entry.lastAttemptedAt ?? null,
  operation: entry.operation.operation,
  payload_json: JSON.stringify(entry.operation),
  presentation_id: entry.presentationId,
  queue_entry_id: entry.queueEntryId,
  queued_at: entry.queuedAt,
  request_id: entry.requestId,
  safe_error_message: entry.safeErrorMessage ?? null,
  schema_version: entry.schemaVersion,
  status: entry.status,
  tenant_id: entry.tenantId,
  updated_at: entry.updatedAt,
  ...overrides
});

const readContext = {
  context: {
    actorId: "actor_1",
    requestId: "request_read",
    tenantId
  }
} as const;

const writeOptions = {
  context: {
    actorId: "actor_1",
    requestId: "request_write",
    tenantId
  },
  intent: "update"
} as const;

const transition = (
  from: PresenterLocalSyncQueueEntryPersistenceRecord["status"],
  to: PresenterLocalSyncQueueEntryPersistenceRecord["status"]
) => ({
  from,
  to,
  transitionedAt
});

const statementAt = (
  executor: RecordingSqlExecutor,
  index: number
): PlanningSqlStatement => {
  const statement = executor.statements[index];

  if (statement === undefined) {
    throw new Error(`Expected SQL statement at index ${String(index)}.`);
  }

  return statement;
};

const expectSqlContains = (statement: PlanningSqlStatement, expected: string): void => {
  expect(statement.sql.toLowerCase()).toContain(expected.toLowerCase());
};

const expectSqlOmits = (
  statement: PlanningSqlStatement,
  forbidden: readonly string[]
): void => {
  forbidden.forEach((value) => {
    expect(statement.sql.toLowerCase()).not.toContain(value.toLowerCase());
  });
};

const secretLikeTokens = [
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "auth0",
  "cookie"
] as const;

describe("Presenter local sync queue SQL repository", () => {
  it("enqueues an entry with tenant scope, canonical payload JSON, and schema version", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.enqueue({
        input: { entry: baseQueuedEntry },
        options: writeOptions
      })
    ).resolves.toEqual({ entry: baseQueuedEntry });

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "INSERT INTO presenter_local_sync_queue_entries");
    expectSqlContains(statement, "payload_json");
    expectSqlOmits(statement, secretLikeTokens);
    expect(statement.parameters).toEqual([
      tenantId,
      "queue_entry_1",
      "presentation_1",
      "actor_1",
      "request_1",
      "revision_4",
      "updatePresentation",
      canonicalOperationJson,
      "queued",
      null,
      null,
      0,
      queuedAt,
      null,
      "presenter-local-sync-queue.v1",
      queuedAt,
      updatedAt
    ] satisfies PlanningSqlValue[]);
  });

  it("rejects enqueue when the entry tenant does not match the operation tenant", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.enqueue({
        input: { entry: { ...baseQueuedEntry, tenantId: "tenant_other" } },
        options: writeOptions
      })
    ).rejects.toThrow("tenant must match");
    expect(executor.statements).toEqual([]);
  });

  it("rejects enqueue when the entry is not in queued status", async () => {
    const executor = createRecordingExecutor([]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.enqueue({
        input: { entry: { ...baseQueuedEntry, status: "replaying" } },
        options: writeOptions
      })
    ).rejects.toThrow();
    expect(executor.statements).toEqual([]);
  });

  it("gets an entry by id with tenant scope and maps the row back to a contract record", async () => {
    const executor = createRecordingExecutor([[toStoredRow(baseQueuedEntry)]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: readContext
      })
    ).resolves.toEqual(baseQueuedEntry);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "FROM presenter_local_sync_queue_entries");
    expectSqlContains(statement, "WHERE tenant_id = ?");
    expectSqlContains(statement, "AND queue_entry_id = ?");
    expect(statement.parameters).toEqual([tenantId, "queue_entry_1"]);
  });

  it("returns null when no tenant-scoped entry is found", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({
        input: { queueEntryId: "missing" },
        options: readContext
      })
    ).resolves.toBeNull();
  });

  it("rejects a row whose operation column disagrees with the stored payload", async () => {
    const executor = createRecordingExecutor([
      [toStoredRow(baseQueuedEntry, { operation: "addSlide" })]
    ]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: readContext
      })
    ).rejects.toThrow();
  });

  it("rejects a row that maps to a different tenant than the operation context", async () => {
    const executor = createRecordingExecutor([
      [toStoredRow({ ...baseQueuedEntry, tenantId: "tenant_other" })]
    ]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: readContext
      })
    ).rejects.toThrow("tenant mismatch");
  });

  it("lists replay-ready entries in order and blocks entries behind a conflict", async () => {
    const conflictedEntry: PresenterLocalSyncQueueEntryPersistenceRecord = {
      ...baseQueuedEntry,
      conflict: {
        conflictKind: "stale-presentation",
        localBaseRevision: "revision_4",
        safeMessage: "Server changed since this edit was queued.",
        serverRevision: "revision_5"
      },
      operation: {
        operation: "updatePresentation" as const,
        payload: { presentationId: "presentation_blocked", title: "Blocked Conflict" }
      },
      presentationId: "presentation_blocked",
      queuedAt: "2026-06-17T01:05:00.000Z",
      queueEntryId: "queue_entry_blocked_conflict",
      status: "conflict" as const
    };
    const blockedAfterConflict = {
      ...baseQueuedEntry,
      operation: {
        operation: "updatePresentation" as const,
        payload: { presentationId: "presentation_blocked", title: "Blocked" }
      },
      presentationId: "presentation_blocked",
      queuedAt: "2026-06-17T01:06:00.000Z",
      queueEntryId: "queue_entry_blocked_followup"
    };
    const executor = createRecordingExecutor([
      [
        toStoredRow(baseQueuedEntry),
        toStoredRow(conflictedEntry),
        toStoredRow(blockedAfterConflict)
      ]
    ]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const ready = await repository.listReadyForReplay({
      input: {},
      options: readContext
    });

    expect(ready.map((entry) => entry.queueEntryId)).toEqual(["queue_entry_1"]);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "where tenant_id = ?");
    expectSqlContains(statement, "order by presentation_id, queued_at, queue_entry_id");
    expect(statement.parameters).toEqual([tenantId, null, null]);
  });

  it("filters replay candidates by presentation when requested", async () => {
    const executor = createRecordingExecutor([[toStoredRow(baseQueuedEntry)]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await repository.listReadyForReplay({
      input: { presentationId: "presentation_1" },
      options: readContext
    });

    expect(statementAt(executor, 0).parameters).toEqual([
      tenantId,
      "presentation_1",
      "presentation_1"
    ]);
  });

  it("marks an entry replaying, incrementing attempt metadata under tenant scope", async () => {
    const replayingRow = toStoredRow(baseQueuedEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      status: "replaying",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[replayingRow]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markReplaying({
      input: {
        queueEntryId: "queue_entry_1",
        transition: transition("queued", "replaying")
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("replaying");
    expect(result.entry.attemptCount).toBe(1);
    expect(result.entry.lastAttemptedAt).toBe(transitionedAt);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "UPDATE presenter_local_sync_queue_entries");
    expectSqlContains(statement, "attempt_count = attempt_count + 1");
    expectSqlContains(statement, "RETURNING");
    expect(statement.parameters).toEqual([
      "replaying",
      transitionedAt,
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "queued"
    ]);
  });

  it("marks an entry synced from the replaying state", async () => {
    const syncedRow = toStoredRow(baseQueuedEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      status: "synced",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[syncedRow]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markSynced({
      input: {
        queueEntryId: "queue_entry_1",
        transition: transition("replaying", "synced")
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("synced");
    expect(statementAt(executor, 0).parameters).toEqual([
      "synced",
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "replaying"
    ]);
  });

  it("stores canonical conflict details when marking an entry conflicted", async () => {
    const conflict: PresenterLocalSyncConflictDetailPersistence = {
      conflictKind: "stale-presentation",
      localBaseRevision: "revision_4",
      safeMessage: "Server changed since this edit was queued.",
      serverRevision: "revision_5"
    };
    const conflictedRow = toStoredRow(baseQueuedEntry, {
      conflict_json: JSON.stringify(conflict),
      status: "conflict",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[conflictedRow]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markConflict({
      input: {
        conflict,
        queueEntryId: "queue_entry_1",
        transition: transition("replaying", "conflict")
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("conflict");
    expect(result.entry.conflict).toEqual(conflict);

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "conflict_json = ?");
    expectSqlContains(statement, "safe_error_message = null");
    expect(statement.parameters).toEqual([
      "conflict",
      '{"conflictKind":"stale-presentation","localBaseRevision":"revision_4","safeMessage":"Server changed since this edit was queued.","serverRevision":"revision_5"}',
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "replaying"
    ]);
  });

  it("stores a redacted safe error message when marking an entry failed", async () => {
    const failedRow = toStoredRow(baseQueuedEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      safe_error_message: "Sync failed. We will retry automatically.",
      status: "failed",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[failedRow]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const result = await repository.markFailed({
      input: {
        queueEntryId: "queue_entry_1",
        safeErrorMessage: "Sync failed. We will retry automatically.",
        transition: transition("replaying", "failed")
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("failed");
    expect(result.entry.safeErrorMessage).toBe("Sync failed. We will retry automatically.");

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "safe_error_message = ?");
    expectSqlContains(statement, "conflict_json = null");
    expect(statement.parameters[1]).toBe("Sync failed. We will retry automatically.");
  });

  it("requeues an entry and clears conflict and failure detail columns", async () => {
    const requeuedRow = toStoredRow(baseQueuedEntry, {
      attempt_count: 1,
      last_attempted_at: transitionedAt,
      status: "queued",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[requeuedRow]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const result = await repository.requeue({
      input: {
        queueEntryId: "queue_entry_1",
        transition: transition("failed", "queued")
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("queued");
    expect(result.entry.requestId).toBe("request_1");

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "conflict_json = null");
    expectSqlContains(statement, "safe_error_message = null");
    expect(statement.parameters).toEqual([
      "queued",
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "failed"
    ]);
  });

  it("cancels an entry and clears conflict and failure detail columns", async () => {
    const cancelledRow = toStoredRow(baseQueuedEntry, {
      status: "cancelled",
      updated_at: transitionedAt
    });
    const executor = createRecordingExecutor([[cancelledRow]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    const result = await repository.cancel({
      input: {
        queueEntryId: "queue_entry_1",
        transition: transition("queued", "cancelled")
      },
      options: writeOptions
    });

    expect(result.entry.status).toBe("cancelled");
    expect(statementAt(executor, 0).parameters).toEqual([
      "cancelled",
      transitionedAt,
      tenantId,
      "queue_entry_1",
      "queued"
    ]);
  });

  it("throws when a transition does not match a tenant-scoped entry", async () => {
    const executor = createRecordingExecutor([[]]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.markSynced({
        input: {
          queueEntryId: "queue_entry_1",
          transition: transition("replaying", "synced")
        },
        options: writeOptions
      })
    ).rejects.toThrow("did not match a tenant-scoped entry");
  });

  it("cleans up terminal entries by tenant and retention timestamp", async () => {
    const executor = createRecordingExecutor([
      [{ queue_entry_id: "queue_entry_1" }, { queue_entry_id: "queue_entry_2" }]
    ]);
    const repository = createPresenterLocalSyncQueueSqlRepository({ executor });

    await expect(
      repository.cleanupSyncedAndCancelled({
        input: { olderThan: transitionedAt },
        options: writeOptions
      })
    ).resolves.toEqual({ removedCount: 2 });

    const statement = statementAt(executor, 0);
    expectSqlContains(statement, "DELETE FROM presenter_local_sync_queue_entries");
    expectSqlContains(statement, "status in ('synced', 'cancelled')");
    expectSqlContains(statement, "updated_at < ?");
    expect(statement.parameters).toEqual([tenantId, transitionedAt]);
  });
});
