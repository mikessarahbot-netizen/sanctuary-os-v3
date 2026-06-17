import { describe, expect, it } from "vitest";
import {
  wrapNodeSqliteMigrationDatabase,
  type NodeSqliteDatabaseLike
} from "./node-sqlite-client.js";

describe("wrapNodeSqliteMigrationDatabase", () => {
  it("delegates exec, and prepare().all/run to the underlying database", () => {
    const execCalls: string[] = [];
    const prepareCalls: string[] = [];
    const fakeDatabase: NodeSqliteDatabaseLike = {
      exec: (sql) => {
        execCalls.push(sql);
      },
      prepare: (sql) => {
        prepareCalls.push(sql);

        return {
          all: (...parameters) => [{ parameters, sql }],
          run: () => ({ changes: 1, lastInsertRowid: 7 })
        };
      }
    };

    const client = wrapNodeSqliteMigrationDatabase(fakeDatabase);

    client.exec("CREATE TABLE t (a TEXT)");
    expect(execCalls).toEqual(["CREATE TABLE t (a TEXT)"]);

    const rows = client.prepare("SELECT ?").all("value");
    expect(prepareCalls).toEqual(["SELECT ?"]);
    expect(rows).toEqual([{ parameters: ["value"], sql: "SELECT ?" }]);

    const result = client.prepare("INSERT INTO t VALUES (?)").run("value");
    expect(result).toEqual({ changes: 1, lastInsertRowid: 7 });
  });
});
