import { describe, expect, it } from "vitest";
import {
  DatabaseConnectionConfigSchema,
  DatabaseOperationContextSchema,
  MigrationStateSchema,
  RepositoryMutationIntentSchema
} from "./index.js";

describe("db scaffold", () => {
  it("validates database connection metadata without secrets", () => {
    expect(
      DatabaseConnectionConfigSchema.parse({
        connectionName: "primary",
        runtime: "postgresql",
        urlEnvVar: "DATABASE_URL"
      })
    ).toEqual({
      connectionName: "primary",
      runtime: "postgresql",
      urlEnvVar: "DATABASE_URL"
    });
  });

  it("requires tenant scope for operations", () => {
    expect(() =>
      DatabaseOperationContextSchema.parse({
        actorId: "actor_1",
        requestId: "request_1",
        tenantId: "tenant_1"
      })
    ).not.toThrow();
  });

  it("models destructive mutation confirmation as an explicit intent", () => {
    expect(RepositoryMutationIntentSchema.parse("destructive-confirmed")).toBe(
      "destructive-confirmed"
    );
    expect(MigrationStateSchema.parse("pending")).toBe("pending");
  });
});
