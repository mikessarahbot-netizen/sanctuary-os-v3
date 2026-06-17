import { describe, expect, it } from "vitest";
import {
  createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig,
  parsePresenterLocalSyncQueuePersistenceRuntimeConfig,
  type SqliteBindValue,
  type SqliteDatabaseClient
} from "./index.js";

interface PreparedCall {
  readonly method: "all" | "run";
  readonly parameters: readonly SqliteBindValue[];
  readonly sql: string;
}

interface RecordingSqliteClient {
  readonly calls: readonly PreparedCall[];
  readonly client: SqliteDatabaseClient;
}

const createRecordingSqliteClient = (
  rows: readonly Record<string, unknown>[] = []
): RecordingSqliteClient => {
  const calls: PreparedCall[] = [];

  return {
    get calls(): readonly PreparedCall[] {
      return calls;
    },
    client: {
      prepare: (sql: string) => ({
        all: (...parameters: readonly SqliteBindValue[]) => {
          calls.push({ method: "all", parameters, sql });

          return rows;
        },
        run: (...parameters: readonly SqliteBindValue[]) => {
          calls.push({ method: "run", parameters, sql });

          return { changes: 1, lastInsertRowid: 1 };
        }
      })
    }
  };
};

describe("Presenter local sync queue persistence composition", () => {
  it("parses defaults to a SQLite development runtime", () => {
    expect(parsePresenterLocalSyncQueuePersistenceRuntimeConfig()).toEqual({
      database: {
        connectionName: "presenter-local-sync-queue",
        runtime: "sqlite",
        urlEnvVar: "SANCTUARY_OS_PRESENTER_LOCAL_SYNC_QUEUE_PATH"
      },
      environment: "development"
    });
  });

  it("rejects a non-SQLite runtime config", () => {
    expect(() =>
      parsePresenterLocalSyncQueuePersistenceRuntimeConfig({
        database: {
          connectionName: "presenter-local-sync-queue",
          runtime: "postgresql",
          urlEnvVar: "SANCTUARY_OS_PRESENTER_LOCAL_SYNC_QUEUE_PATH"
        }
      })
    ).toThrow("requires SQLite runtime");
  });

  it("selects a working SQLite-backed repository wired through the injected client", async () => {
    const recording = createRecordingSqliteClient();
    const selection = createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig(
      {},
      { sqlite: { database: recording.client } }
    );

    expect(selection.mode).toBe("sqlite");

    await expect(
      selection.repository.getById({
        input: { queueEntryId: "queue_entry_1" },
        options: {
          context: {
            actorId: "actor_1",
            requestId: "request_read",
            tenantId: "tenant_1"
          }
        }
      })
    ).resolves.toBeNull();

    expect(recording.calls).toHaveLength(1);
    expect(recording.calls[0]?.method).toBe("all");
    expect(recording.calls[0]?.sql.toLowerCase()).toContain(
      "from presenter_local_sync_queue_entries"
    );
    expect(recording.calls[0]?.parameters).toEqual(["tenant_1", "queue_entry_1"]);
  });

  it("throws when SQLite runtime dependencies are missing", () => {
    expect(() =>
      createPresenterLocalSyncQueuePersistenceSelectionFromRuntimeConfig({}, {})
    ).toThrow("SQLite dependencies are required");
  });
});
