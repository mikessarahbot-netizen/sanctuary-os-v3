import { describe, expect, it, vi } from "vitest";
import type { ApiEventEnvelope } from "../../events/index.js";
import type { PlanningReadinessInput, PlanningReadinessResult } from "../../domain/index.js";
import { createPlanningReadinessService } from "./readiness.js";

const readinessInput: PlanningReadinessInput = {
  assignments: [{ assignmentId: "assignment_1", roleId: "role_1", status: "confirmed" }],
  ccliStatuses: [{ serviceItemId: "item_1", status: "current" }],
  knownBlockers: [],
  rehearsalAcknowledgements: [
    {
      assignmentId: "assignment_1",
      assetId: "asset_chart_1",
      personId: "person_1",
      readinessSignal: "ready",
      serviceItemId: "item_1"
    }
  ],
  requiredRoles: [{ displayName: "Leader", roleId: "role_1" }],
  serviceId: "service_1",
  serviceItems: [
    {
      durationMinutes: 5,
      hasAttachedSong: true,
      hasChart: true,
      hasCurrentCcliLog: true,
      hasVisibleRehearsalAsset: true,
      requiresRehearsalAcknowledgement: true,
      requiresCcliLog: true,
      serviceItemId: "item_1",
      title: "Song"
    }
  ],
  tenantId: "tenant_1"
};

describe("createPlanningReadinessService", () => {
  it("refreshes readiness with tenant scope, role checks, persistence, and event publication", async () => {
    const publishAfterCommit = vi.fn<(event: ApiEventEnvelope) => Promise<void>>(() =>
      Promise.resolve()
    );
    const saveReadinessResult = vi.fn<
      (command: {
        readonly actorId: string;
        readonly requestId: string;
        readonly result: PlanningReadinessResult;
        readonly serviceId: string;
        readonly tenantId: string;
      }) => Promise<void>
    >(() => Promise.resolve());
    const service = createPlanningReadinessService({
      eventPublisher: { publishAfterCommit },
      readinessRepository: {
        loadReadinessInput: () => Promise.resolve(readinessInput),
        saveReadinessResult
      }
    });

    const result = await service.refreshReadinessScore({
      actor: {
        actorId: "actor_1",
        roles: ["worship_leader"],
        tenantId: "tenant_1"
      },
      requestId: "request_1",
      serviceId: "service_1"
    });

    expect(result.readinessScore).toBe(100);
    expect(saveReadinessResult).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor_1",
        requestId: "request_1",
        serviceId: "service_1",
        tenantId: "tenant_1"
      })
    );
    expect(publishAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: "service_1",
        actorId: "actor_1",
        eventType: "readiness.updated",
        payload: {
          band: "ready",
          readinessScore: 100,
          serviceId: "service_1"
        },
        schemaVersion: "planning-readiness.v1",
        tenantId: "tenant_1"
      })
    );
  });

  it("rejects actors without a planning role", async () => {
    const service = createPlanningReadinessService({
      eventPublisher: { publishAfterCommit: () => Promise.resolve() },
      readinessRepository: {
        loadReadinessInput: () => Promise.resolve(readinessInput),
        saveReadinessResult: () => Promise.resolve()
      }
    });

    await expect(
      service.refreshReadinessScore({
        actor: {
          actorId: "actor_1",
          roles: ["viewer"],
          tenantId: "tenant_1"
        },
        requestId: "request_1",
        serviceId: "service_1"
      })
    ).rejects.toThrow("Actor is not allowed to refresh planning readiness.");
  });

  it("rejects cross-tenant readiness input before saving or publishing", async () => {
    const publishAfterCommit = vi.fn<(event: ApiEventEnvelope) => Promise<void>>(() =>
      Promise.resolve()
    );
    const saveReadinessResult = vi.fn<
      (command: {
        readonly actorId: string;
        readonly requestId: string;
        readonly result: PlanningReadinessResult;
        readonly serviceId: string;
        readonly tenantId: string;
      }) => Promise<void>
    >(() => Promise.resolve());
    const service = createPlanningReadinessService({
      eventPublisher: { publishAfterCommit },
      readinessRepository: {
        loadReadinessInput: () =>
          Promise.resolve({
          ...readinessInput,
          tenantId: "tenant_2"
        }),
        saveReadinessResult
      }
    });

    await expect(
      service.refreshReadinessScore({
        actor: {
          actorId: "actor_1",
          roles: ["planner"],
          tenantId: "tenant_1"
        },
        requestId: "request_1",
        serviceId: "service_1"
      })
    ).rejects.toThrow("Planning readiness input tenant mismatch.");

    expect(saveReadinessResult).not.toHaveBeenCalled();
    expect(publishAfterCommit).not.toHaveBeenCalled();
  });
});
