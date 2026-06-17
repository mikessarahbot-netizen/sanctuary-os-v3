import { describe, expect, it } from "vitest";
import {
  createSqliteExecutor,
  type SqliteBindValue,
  type SqliteDatabaseClient,
  type SqliteRunResult
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

const createRecordingSqliteClient = (config: {
  readonly rows?: readonly Record<string, unknown>[];
  readonly runResult?: SqliteRunResult;
  readonly failWith?: Error;
}): RecordingSqliteClient => {
  const calls: PreparedCall[] = [];

  return {
    get calls(): readonly PreparedCall[] {
      return calls;
    },
    client: {
      prepare: (sql: string) => ({
        all: (...parameters: readonly SqliteBindValue[]) => {
          if (config.failWith !== undefined) {
            throw config.failWith;
          }

          calls.push({ method: "all", parameters, sql });

          return config.rows ?? [];
        },
        run: (...parameters: readonly SqliteBindValue[]) => {
          if (config.failWith !== undefined) {
            throw config.failWith;
          }

          calls.push({ method: "run", parameters, sql });

          return config.runResult ?? { changes: 1, lastInsertRowid: 1 };
        }
      })
    }
  };
};

describe("SQLite executor", () => {
  it("routes SELECT statements through all() and maps rows", async () => {
    const recording = createRecordingSqliteClient({
      rows: [{ queue_entry_id: "queue_entry_1", tenant_id: "tenant_1" }]
    });
    const executor = createSqliteExecutor({ database: recording.client });

    const result = await executor.query({
      name: "presenter.local_sync_queue.get_by_id",
      parameters: ["tenant_1", "queue_entry_1"],
      sql: "SELECT tenant_id, queue_entry_id FROM presenter_local_sync_queue_entries WHERE tenant_id = ?"
    });

    expect(result.rows).toEqual([
      { queue_entry_id: "queue_entry_1", tenant_id: "tenant_1" }
    ]);
    expect(recording.calls).toEqual([
      {
        method: "all",
        parameters: ["tenant_1", "queue_entry_1"],
        sql: expect.stringContaining("SELECT") as string
      }
    ]);
  });

  it("routes RETURNING mutations through all()", async () => {
    const recording = createRecordingSqliteClient({
      rows: [{ status: "replaying" }]
    });
    const executor = createSqliteExecutor({ database: recording.client });

    await executor.query({
      name: "presenter.local_sync_queue.mark_replaying",
      parameters: ["replaying", "tenant_1", "queue_entry_1"],
      sql: "UPDATE presenter_local_sync_queue_entries SET status = ? WHERE tenant_id = ? AND queue_entry_id = ? RETURNING status"
    });

    expect(recording.calls[0]?.method).toBe("all");
  });

  it("routes non-returning writes through run() and yields no rows", async () => {
    const recording = createRecordingSqliteClient({});
    const executor = createSqliteExecutor({ database: recording.client });

    const result = await executor.query({
      name: "presenter.local_sync_queue.enqueue",
      parameters: ["tenant_1", "queue_entry_1"],
      sql: "INSERT INTO presenter_local_sync_queue_entries (tenant_id, queue_entry_id) VALUES (?, ?)"
    });

    expect(result.rows).toEqual([]);
    expect(recording.calls[0]?.method).toBe("run");
  });

  it("normalizes boolean parameters to integers", async () => {
    const recording = createRecordingSqliteClient({});
    const executor = createSqliteExecutor({ database: recording.client });

    await executor.query({
      name: "test.boolean",
      parameters: [true, false, "tenant_1"],
      sql: "INSERT INTO t (a, b, c) VALUES (?, ?, ?)"
    });

    expect(recording.calls[0]?.parameters).toEqual([1, 0, "tenant_1"]);
  });

  it("normalizes bigint row values to numbers", async () => {
    const recording = createRecordingSqliteClient({
      rows: [{ attempt_count: 2n, tenant_id: "tenant_1" }]
    });
    const executor = createSqliteExecutor({ database: recording.client });

    const result = await executor.query({
      name: "test.bigint",
      parameters: [],
      sql: "SELECT attempt_count, tenant_id FROM t"
    });

    expect(result.rows).toEqual([{ attempt_count: 2, tenant_id: "tenant_1" }]);
  });

  it("rejects array-bound parameters", async () => {
    const recording = createRecordingSqliteClient({});
    const executor = createSqliteExecutor({ database: recording.client });

    await expect(
      executor.query({
        name: "test.array",
        parameters: [["a", "b"]],
        sql: "SELECT * FROM t WHERE x = ANY(?)"
      })
    ).rejects.toThrow("does not support array-bound parameters");
    expect(recording.calls).toEqual([]);
  });

  it("wraps engine failures with the statement name", async () => {
    const recording = createRecordingSqliteClient({
      failWith: new Error("CHECK constraint failed: attempt_count >= 0")
    });
    const executor = createSqliteExecutor({ database: recording.client });

    await expect(
      executor.query({
        name: "presenter.local_sync_queue.enqueue",
        parameters: ["tenant_1"],
        sql: "INSERT INTO presenter_local_sync_queue_entries (tenant_id) VALUES (?)"
      })
    ).rejects.toThrow(
      "SQLite query failed for presenter.local_sync_queue.enqueue: CHECK constraint failed"
    );
  });
});
