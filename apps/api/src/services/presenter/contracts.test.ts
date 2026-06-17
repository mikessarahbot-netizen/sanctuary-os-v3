import { describe, expect, it } from "vitest";
import {
  CreatePresentationFromServiceCommandSchema,
  DeletePresentationCommandSchema,
  GetPresentationForServiceQuerySchema,
  PresenterCommandSchema,
  SetPresenterOutputStateCommandSchema
} from "./contracts.js";

const actor = {
  actorId: "actor_1",
  roles: ["worship_leader"],
  tenantId: "tenant_1"
};

const fixedUpdatedAt = "2026-06-17T12:00:00.000Z";

describe("Presenter service contracts", () => {
  it("validates tenant-scoped read queries with actor and request context", () => {
    expect(
      GetPresentationForServiceQuerySchema.parse({
        actor,
        input: {
          serviceId: "service_1"
        },
        requestId: "request_1"
      })
    ).toEqual({
      actor,
      input: {
        serviceId: "service_1"
      },
      requestId: "request_1"
    });
  });

  it("validates create-from-service commands without mutating Planning services", () => {
    const command = CreatePresentationFromServiceCommandSchema.parse({
      actor,
      input: {
        serviceId: "service_1",
        styleTemplateId: "style_1",
        title: "Sunday Presenter"
      },
      intent: "create",
      requestId: "request_create"
    });

    expect(command.input.serviceId).toBe("service_1");
    expect(JSON.stringify(command)).not.toContain("updateService");
  });

  it("requires destructive confirmation for presentation deletion", () => {
    expect(() =>
      DeletePresentationCommandSchema.parse({
        actor,
        input: {
          confirmationReason: "Duplicate deck.",
          presentationId: "presentation_1"
        },
        intent: "update",
        requestId: "request_delete"
      })
    ).toThrow();

    expect(
      DeletePresentationCommandSchema.parse({
        actor,
        input: {
          confirmationReason: "Duplicate deck.",
          presentationId: "presentation_1"
        },
        intent: "destructive-confirmed",
        requestId: "request_delete"
      })
    ).toMatchObject({
      intent: "destructive-confirmed"
    });
  });

  it("validates output-state mutations and rejects stream-control fields", () => {
    expect(
      SetPresenterOutputStateCommandSchema.parse({
        actor,
        input: {
          blackout: true,
          currentGroupId: "group_1",
          currentSlideId: "slide_1",
          freeze: false,
          mode: "live",
          presentationId: "presentation_1",
          tenantId: "tenant_1",
          updatedAt: fixedUpdatedAt
        },
        intent: "update",
        requestId: "request_output"
      })
    ).toMatchObject({
      input: {
        blackout: true,
        mode: "live"
      }
    });

    expect(() =>
      SetPresenterOutputStateCommandSchema.parse({
        actor,
        input: {
          currentGroupId: "group_1",
          currentSlideId: "slide_1",
          mode: "live",
          presentationId: "presentation_1",
          startStream: true,
          tenantId: "tenant_1",
          updatedAt: fixedUpdatedAt
        },
        intent: "update",
        requestId: "request_output"
      })
    ).toThrow();
  });

  it("wraps command envelopes for future resolver delegation", () => {
    expect(
      PresenterCommandSchema.parse({
        commandName: "setPresenterOutputState",
        operation: {
          actor,
          input: {
            currentGroupId: "group_1",
            currentSlideId: "slide_1",
            mode: "preview",
            presentationId: "presentation_1",
            tenantId: "tenant_1",
            updatedAt: fixedUpdatedAt
          },
          intent: "update",
          requestId: "request_output"
        }
      })
    ).toMatchObject({
      commandName: "setPresenterOutputState"
    });
  });
});
