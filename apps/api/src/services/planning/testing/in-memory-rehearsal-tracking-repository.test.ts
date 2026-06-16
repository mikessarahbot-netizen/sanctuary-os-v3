import { describe, expect, it } from "vitest";
import type {
  PlanningRehearsalAcknowledgementPersistenceRecord,
  PlanningRehearsalAssetVisibilityPersistenceRecord
} from "@sanctuary-os/db";
import { createPlanningRehearsalAcknowledgementService } from "../rehearsal-acknowledgements.js";
import { createPlanningRehearsalAssetVisibilityService } from "../rehearsal-assets.js";
import { createInMemoryPlanningRehearsalTrackingRepositoryAdapter } from "./in-memory-rehearsal-tracking-repository.js";

const visibilityRecord: PlanningRehearsalAssetVisibilityPersistenceRecord = {
  assetId: "asset_chart_1",
  assetType: "chart",
  isVisible: true,
  rehearsalAssetVisibilityId: "visibility_seed_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1",
  title: "Open The Gates Chart",
  updatedAt: "2026-06-21T14:30:00.000Z",
  visibleToRoleIds: ["role_vocal", "role_guitar"]
};

const otherTenantVisibilityRecord: PlanningRehearsalAssetVisibilityPersistenceRecord =
  {
    ...visibilityRecord,
    rehearsalAssetVisibilityId: "visibility_seed_2",
    tenantId: "tenant_2"
  };

const acknowledgementRecord: PlanningRehearsalAcknowledgementPersistenceRecord = {
  acknowledgedAt: "2026-06-21T15:00:00.000Z",
  assetId: "asset_chart_1",
  assignmentId: "assignment_1",
  notes: "Reviewed chart and ready for rehearsal.",
  personId: "person_1",
  readinessSignal: "ready",
  rehearsalAcknowledgementId: "rehearsal_ack_seed_1",
  serviceId: "service_1",
  serviceItemId: "item_1",
  tenantId: "tenant_1"
};

const otherTenantAcknowledgementRecord: PlanningRehearsalAcknowledgementPersistenceRecord =
  {
    ...acknowledgementRecord,
    rehearsalAcknowledgementId: "rehearsal_ack_seed_2",
    tenantId: "tenant_2"
  };

const actor = {
  actorId: "actor_1",
  roles: ["worship_leader" as const],
  tenantId: "tenant_1"
};

const createSeededAdapter = () =>
  createInMemoryPlanningRehearsalTrackingRepositoryAdapter({
    acknowledgements: [acknowledgementRecord, otherTenantAcknowledgementRecord],
    assetVisibility: [visibilityRecord, otherTenantVisibilityRecord]
  });

describe("createInMemoryPlanningRehearsalTrackingRepositoryAdapter", () => {
  it("exercises rehearsal tracking services through tenant-scoped persistence contracts", async () => {
    const adapter = createSeededAdapter();
    const assetService = createPlanningRehearsalAssetVisibilityService({
      planningRepository: adapter.repository
    });
    const acknowledgementService = createPlanningRehearsalAcknowledgementService({
      planningRepository: adapter.repository
    });

    await expect(
      assetService.listAssetVisibility({
        actor,
        input: {
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_visibility_list"
      })
    ).resolves.toEqual([visibilityRecord]);

    await expect(
      assetService.setAssetVisibility({
        actor,
        input: {
          assetId: "asset_audio_1",
          assetType: "audio",
          isVisible: false,
          serviceId: "service_1",
          serviceItemId: "item_1",
          title: "Open The Gates Rehearsal Track",
          updatedAt: "2026-06-21T15:10:00.000Z",
          visibleToRoleIds: ["role_band"]
        },
        requestId: "request_visibility_set"
      })
    ).resolves.toMatchObject({
      assetId: "asset_audio_1",
      isVisible: false,
      rehearsalAssetVisibilityId: "visibility_3",
      tenantId: "tenant_1"
    });

    await expect(
      acknowledgementService.listAcknowledgements({
        actor,
        input: {
          assetId: "asset_chart_1",
          assignmentId: "assignment_1",
          personId: "person_1",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_ack_list"
      })
    ).resolves.toEqual([acknowledgementRecord]);

    await expect(
      acknowledgementService.recordAcknowledgement({
        actor: {
          actorId: "actor_2",
          roles: ["volunteer"],
          tenantId: "tenant_1"
        },
        input: {
          acknowledgedAt: "2026-06-21T15:20:00.000Z",
          assetId: "asset_audio_1",
          assignmentId: "assignment_2",
          personId: "person_2",
          readinessSignal: "needs-practice",
          serviceId: "service_1",
          serviceItemId: "item_1"
        },
        requestId: "request_ack_record"
      })
    ).resolves.toMatchObject({
      assetId: "asset_audio_1",
      readinessSignal: "needs-practice",
      rehearsalAcknowledgementId: "rehearsal_ack_3",
      tenantId: "tenant_1"
    });

    expect(adapter.readOperations()).toEqual([
      {
        actorId: "actor_1",
        operationName: "listRehearsalAssetVisibility",
        requestId: "request_visibility_list",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        intent: "update",
        operationName: "setRehearsalAssetVisibility",
        requestId: "request_visibility_set",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_1",
        operationName: "listRehearsalAcknowledgements",
        requestId: "request_ack_list",
        tenantId: "tenant_1"
      },
      {
        actorId: "actor_2",
        intent: "create",
        operationName: "recordRehearsalAcknowledgement",
        requestId: "request_ack_record",
        tenantId: "tenant_1"
      }
    ]);
  });

  it("returns tenant-local empty reads without leaking cross-tenant rehearsal records", async () => {
    const adapter = createSeededAdapter();
    const assetService = createPlanningRehearsalAssetVisibilityService({
      planningRepository: adapter.repository
    });
    const acknowledgementService = createPlanningRehearsalAcknowledgementService({
      planningRepository: adapter.repository
    });
    const otherTenantActor = {
      actorId: "actor_3",
      roles: ["viewer" as const],
      tenantId: "tenant_1"
    };

    await expect(
      assetService.listAssetVisibility({
        actor: otherTenantActor,
        input: {
          serviceId: "service_2"
        },
        requestId: "request_visibility_empty"
      })
    ).resolves.toEqual([]);

    await expect(
      acknowledgementService.listAcknowledgements({
        actor: otherTenantActor,
        input: {
          serviceId: "service_2"
        },
        requestId: "request_ack_empty"
      })
    ).resolves.toEqual([]);
  });

  it("Zod-validates DB persistence operation shapes at the adapter boundary", async () => {
    const adapter = createSeededAdapter();
    const malformedOperation = {
      input: {
        assetId: "asset_chart_1",
        assetType: "chart",
        isVisible: true,
        serviceId: "service_1",
        serviceItemId: "item_1",
        title: "Open The Gates Chart",
        updatedAt: "not-a-date",
        visibleToRoleIds: ["role_vocal"]
      },
      options: {
        context: {
          actorId: "actor_1",
          requestId: "request_invalid_visibility",
          tenantId: "tenant_1"
        },
        intent: "update"
      }
    } as unknown as Parameters<
      typeof adapter.repository.setRehearsalAssetVisibility
    >[0];

    await expect(
      adapter.repository.setRehearsalAssetVisibility(malformedOperation)
    ).rejects.toThrow();
  });
});
