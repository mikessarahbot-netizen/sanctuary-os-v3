import { describe, expect, it } from "vitest";
import {
  ApiEventTypeSchema,
  ApiRoleSchema,
  PresentationUpdatedEventPayloadSchema,
  ReadinessUpdatedEventPayloadSchema,
  calculatePlanningReadiness,
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
    expect(ApiEventTypeSchema.parse("presentation.updated")).toBe("presentation.updated");
    expect(
      PresentationUpdatedEventPayloadSchema.parse({
        changeKind: "updated",
        presentationId: "presentation_1",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T18:30:00.000Z"
      })
    ).toEqual({
      changeKind: "updated",
      presentationId: "presentation_1",
      tenantId: "tenant_1",
      updatedAt: "2026-06-16T18:30:00.000Z"
    });
  });

  it("calculates readiness from planning domain inputs", () => {
    const readiness = calculatePlanningReadiness({
      assignments: [
        {
          assignmentId: "assignment_1",
          roleId: "role_worship_leader",
          status: "confirmed"
        },
        {
          assignmentId: "assignment_2",
          roleId: "role_vocal",
          status: "confirmed"
        }
      ],
      knownBlockers: [],
      requiredRoles: [
        { displayName: "Worship Leader", roleId: "role_worship_leader" },
        { displayName: "Vocal", roleId: "role_vocal" }
      ],
      serviceId: "service_1",
      serviceItems: [
        {
          durationMinutes: 5,
          hasAttachedSong: true,
          hasChart: true,
          hasCurrentCcliLog: true,
          hasVisibleRehearsalAsset: true,
          requiresCcliLog: true,
          serviceItemId: "item_song",
          title: "Opening Song"
        },
        {
          durationMinutes: 1,
          hasAttachedSong: false,
          hasChart: false,
          hasCurrentCcliLog: false,
          hasVisibleRehearsalAsset: true,
          requiresCcliLog: false,
          serviceItemId: "item_welcome",
          title: "Welcome"
        }
      ],
      tenantId: "tenant_1"
    });

    expect(readiness.readinessScore).toBe(100);
    expect(readiness.band).toBe("ready");
    expect(
      ReadinessUpdatedEventPayloadSchema.parse({
        band: readiness.band,
        readinessScore: readiness.readinessScore,
        serviceId: readiness.serviceId
      })
    ).toEqual({
      band: "ready",
      readinessScore: 100,
      serviceId: "service_1"
    });
  });

  it("surfaces incomplete readiness checks without leaking person data", () => {
    const readiness = calculatePlanningReadiness({
      assignments: [
        {
          assignmentId: "assignment_1",
          roleId: "role_worship_leader",
          status: "pending"
        }
      ],
      knownBlockers: [],
      requiredRoles: [
        { displayName: "Worship Leader", roleId: "role_worship_leader" },
        { displayName: "Vocal", roleId: "role_vocal" }
      ],
      serviceId: "service_2",
      serviceItems: [
        {
          hasAttachedSong: true,
          hasChart: false,
          hasCurrentCcliLog: false,
          hasVisibleRehearsalAsset: false,
          requiresCcliLog: true,
          serviceItemId: "item_song",
          title: "Closing Song"
        }
      ],
      tenantId: "tenant_1"
    });

    expect(readiness.readinessScore).toBeLessThan(100);
    expect(readiness.risks.length).toBeGreaterThan(0);
    expect(JSON.stringify(readiness)).not.toContain("personRef");
  });
});
