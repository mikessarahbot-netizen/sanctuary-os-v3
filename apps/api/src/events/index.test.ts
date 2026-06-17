import { describe, expect, it } from "vitest";
import { createInMemoryEventPublisher, validateApiEventEnvelope } from "./index.js";

describe("createInMemoryEventPublisher", () => {
  it("validates and records published events in order", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    await eventPublisher.publishAfterCommit({
      aggregateId: "service_1",
      actorId: "actor_1",
      eventType: "service.published",
      occurredAt: "2026-06-16T18:30:00.000Z",
      payload: {
        serviceId: "service_1",
        status: "published"
      },
      requestId: "request_publish",
      schemaVersion: "planning-service-published.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "service_1",
      actorId: "actor_1",
      eventType: "assignment.statusChanged",
      occurredAt: "2026-06-16T18:31:00.000Z",
      payload: {
        assignmentId: "assignment_1",
        serviceId: "service_1",
        status: "confirmed"
      },
      requestId: "request_assignment",
      schemaVersion: "planning-assignment-status.v1",
      tenantId: "tenant_1"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        eventType: event.eventType,
        requestId: event.requestId
      }))
    ).toEqual([
      {
        eventType: "service.published",
        requestId: "request_publish"
      },
      {
        eventType: "assignment.statusChanged",
        requestId: "request_assignment"
      }
    ]);
  });

  it("rejects event envelopes with invalid event-specific payloads", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    let rejected = false;

    try {
      await eventPublisher.publishAfterCommit({
        aggregateId: "service_1",
        actorId: "actor_1",
        eventType: "service.published",
        occurredAt: "2026-06-16T18:30:00.000Z",
        payload: {
          serviceId: "service_1",
          status: "draft"
        },
        requestId: "request_publish",
        schemaVersion: "planning-service-published.v1",
        tenantId: "tenant_1"
      });
    } catch {
      rejected = true;
    }

    expect(rejected).toBe(true);
    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });

  it("rejects mismatched event schema versions", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    let rejected = false;

    try {
      await eventPublisher.publishAfterCommit({
        aggregateId: "service_1",
        actorId: "actor_1",
        eventType: "assignment.statusChanged",
        occurredAt: "2026-06-16T18:30:00.000Z",
        payload: {
          assignmentId: "assignment_1",
          serviceId: "service_1",
          status: "confirmed"
        },
        requestId: "request_assignment",
        schemaVersion: "planning-readiness.v1",
        tenantId: "tenant_1"
      });
    } catch {
      rejected = true;
    }

    expect(rejected).toBe(true);
    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });

  it("can clear recorded events between assertions", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    await eventPublisher.publishAfterCommit({
      aggregateId: "service_1",
      eventType: "readiness.updated",
      occurredAt: "2026-06-16T18:30:00.000Z",
      payload: {
        band: "ready",
        readinessScore: 100,
        serviceId: "service_1"
      },
      requestId: "request_readiness",
      schemaVersion: "planning-readiness.v1",
      tenantId: "tenant_1"
    });

    eventPublisher.clear();

    expect(eventPublisher.readPublishedEvents()).toEqual([]);
  });

  it("validates Presenter event payload contracts and schema versions", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    await eventPublisher.publishAfterCommit({
      aggregateId: "presentation_1",
      actorId: "actor_1",
      eventType: "presentation.updated",
      occurredAt: "2026-06-16T21:20:00.000Z",
      payload: {
        changeKind: "updated",
        presentationId: "presentation_1",
        serviceId: "service_1",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T21:20:00.000Z"
      },
      requestId: "request_presentation_update",
      schemaVersion: "presenter-presentation-updated.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "presentation_1",
      actorId: "actor_1",
      eventType: "presenter.slideChanged",
      occurredAt: "2026-06-16T21:21:00.000Z",
      payload: {
        activeSlideId: "slide_2",
        presentationId: "presentation_1",
        previousSlideId: "slide_1",
        tenantId: "tenant_1"
      },
      requestId: "request_slide_changed",
      schemaVersion: "presenter-slide-changed.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "presentation_1",
      actorId: "actor_1",
      eventType: "presenter.outputBlanked",
      occurredAt: "2026-06-16T21:22:00.000Z",
      payload: {
        outputTargetId: "output_main",
        presentationId: "presentation_1",
        reason: "Prayer ministry",
        tenantId: "tenant_1"
      },
      requestId: "request_output_blanked",
      schemaVersion: "presenter-output-blanked.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "presentation_1",
      actorId: "actor_1",
      eventType: "presenter.outputRestored",
      occurredAt: "2026-06-16T21:23:00.000Z",
      payload: {
        outputTargetId: "output_main",
        presentationId: "presentation_1",
        tenantId: "tenant_1"
      },
      requestId: "request_output_restored",
      schemaVersion: "presenter-output-restored.v1",
      tenantId: "tenant_1"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        eventType: event.eventType,
        schemaVersion: event.schemaVersion
      }))
    ).toEqual([
      {
        eventType: "presentation.updated",
        schemaVersion: "presenter-presentation-updated.v1"
      },
      {
        eventType: "presenter.slideChanged",
        schemaVersion: "presenter-slide-changed.v1"
      },
      {
        eventType: "presenter.outputBlanked",
        schemaVersion: "presenter-output-blanked.v1"
      },
      {
        eventType: "presenter.outputRestored",
        schemaVersion: "presenter-output-restored.v1"
      }
    ]);
  });

  it("rejects Presenter event tenant and aggregate mismatches", () => {
    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "presentation_1",
        actorId: "actor_1",
        eventType: "presenter.slideChanged",
        occurredAt: "2026-06-16T21:21:00.000Z",
        payload: {
          activeSlideId: "slide_2",
          presentationId: "presentation_1",
          tenantId: "tenant_2"
        },
        requestId: "request_slide_changed",
        schemaVersion: "presenter-slide-changed.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Presenter event tenant must match payload tenant.");

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "presentation_2",
        actorId: "actor_1",
        eventType: "presenter.outputRestored",
        occurredAt: "2026-06-16T21:23:00.000Z",
        payload: {
          presentationId: "presentation_1",
          tenantId: "tenant_1"
        },
        requestId: "request_output_restored",
        schemaVersion: "presenter-output-restored.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Presenter event aggregate must match presentation ID.");
  });

  it("rejects Presenter event payloads with OBS, stream, raw media, or secret fields", () => {
    const baseEvent = {
      aggregateId: "presentation_1",
      actorId: "actor_1",
      eventType: "presenter.outputBlanked" as const,
      occurredAt: "2026-06-16T21:22:00.000Z",
      payload: {
        presentationId: "presentation_1",
        tenantId: "tenant_1"
      },
      requestId: "request_output_blanked",
      schemaVersion: "presenter-output-blanked.v1" as const,
      tenantId: "tenant_1"
    };

    expect(() =>
      validateApiEventEnvelope({
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          obsScene: "scene_main"
        }
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      validateApiEventEnvelope({
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          rawMediaPayload: "base64"
        }
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      validateApiEventEnvelope({
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          startStream: true
        }
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      validateApiEventEnvelope({
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          vendorToken: "secret"
        }
      })
    ).toThrow("Unrecognized key");
  });
});
