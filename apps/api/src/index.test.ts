import { describe, expect, it } from "vitest";
import {
  ApiEventTypeSchema,
  ApiRoleSchema,
  plannedGraphqlMutations,
  plannedGraphqlQueries
} from "./index.js";

describe("api scaffold", () => {
  it("exports planned GraphQL surface from the API plan", () => {
    expect(plannedGraphqlQueries).toContain("serviceReadiness");
    expect(plannedGraphqlMutations).toContain("generateSetlist");
  });

  it("validates planned API boundary enums", () => {
    expect(ApiRoleSchema.parse("worship_leader")).toBe("worship_leader");
    expect(ApiEventTypeSchema.parse("readiness.updated")).toBe("readiness.updated");
  });
});
