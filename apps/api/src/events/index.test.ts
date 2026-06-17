import { describe, expect, it } from "vitest";
import {
  ApiEventTypeSchema,
  PresentationUpdatedEventPayloadSchema,
  PresenterOutputBlankedEventPayloadSchema,
  PresenterOutputRestoredEventPayloadSchema,
  PresenterSlideChangedEventPayloadSchema,
  createInMemoryEventPublisher,
  validateApiEventEnvelope
} from "./index.js";

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
});

describe("Presenter event contracts", () => {
  it("validates Presenter event type names and schema versions", () => {
    const eventTypes = [
      "presentation.updated",
      "presenter.slideChanged",
      "presenter.outputBlanked",
      "presenter.outputRestored"
    ] as const;

    expect(eventTypes.map((eventType) => ApiEventTypeSchema.parse(eventType))).toEqual([
      "presentation.updated",
      "presenter.slideChanged",
      "presenter.outputBlanked",
      "presenter.outputRestored"
    ]);

    expect(
      eventTypes.map((eventType) =>
        validateApiEventEnvelope({
          aggregateId: "presentation_1",
          actorId: "actor_1",
          eventType,
          occurredAt: "2026-06-16T18:30:00.000Z",
          payload: buildPresenterPayload(eventType),
          requestId: `request_${eventType}`,
          schemaVersion: buildPresenterSchemaVersion(eventType),
          tenantId: "tenant_1"
        }).schemaVersion
      )
    ).toEqual([
      "presenter-presentation-updated.v1",
      "presenter-slide-changed.v1",
      "presenter-output-blanked.v1",
      "presenter-output-restored.v1"
    ]);
  });

  it("rejects Presenter envelopes with mismatched tenant or aggregate scope", () => {
    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "presentation_1",
        eventType: "presentation.updated",
        occurredAt: "2026-06-16T18:30:00.000Z",
        payload: {
          changeKind: "metadata-updated",
          presentationId: "presentation_1",
          tenantId: "tenant_other",
          updatedAt: "2026-06-16T18:30:00.000Z"
        },
        requestId: "request_presenter",
        schemaVersion: "presenter-presentation-updated.v1",
        tenantId: "tenant_1"
      })
    ).toThrow();

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "presentation_other",
        eventType: "presenter.slideChanged",
        occurredAt: "2026-06-16T18:30:00.000Z",
        payload: {
          activeSlideId: "slide_2",
          changeSource: "next",
          presentationId: "presentation_1",
          previousSlideId: "slide_1",
          tenantId: "tenant_1"
        },
        requestId: "request_presenter",
        schemaVersion: "presenter-slide-changed.v1",
        tenantId: "tenant_1"
      })
    ).toThrow();
  });

  it("rejects OBS, stream, raw-media, and secret-like fields in Presenter payloads", () => {
    expect(() =>
      PresentationUpdatedEventPayloadSchema.parse({
        changeKind: "slide-updated",
        presentationId: "presentation_1",
        rawMediaPayload: "base64-media",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T18:30:00.000Z"
      })
    ).toThrow();

    expect(() =>
      PresenterSlideChangedEventPayloadSchema.parse({
        activeSlideId: "slide_2",
        changeSource: "direct",
        obsSceneName: "Live Slides",
        presentationId: "presentation_1",
        tenantId: "tenant_1"
      })
    ).toThrow();

    expect(() =>
      PresenterOutputBlankedEventPayloadSchema.parse({
        blankedAt: "2026-06-16T18:30:00.000Z",
        presentationId: "presentation_1",
        streamKey: "secret_stream_key",
        tenantId: "tenant_1"
      })
    ).toThrow();

    expect(() =>
      PresenterOutputRestoredEventPayloadSchema.parse({
        apiToken: "secret_token",
        presentationId: "presentation_1",
        restoredAt: "2026-06-16T18:30:00.000Z",
        tenantId: "tenant_1"
      })
    ).toThrow();
  });

  it("records validated Presenter events through the in-memory publisher", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    await eventPublisher.publishAfterCommit({
      aggregateId: "presentation_1",
      actorId: "actor_1",
      eventType: "presenter.outputBlanked",
      occurredAt: "2026-06-16T18:30:00.000Z",
      payload: {
        blankedAt: "2026-06-16T18:30:00.000Z",
        outputTargetId: "output_main",
        presentationId: "presentation_1",
        reason: "Pastoral prayer",
        tenantId: "tenant_1"
      },
      requestId: "request_blank",
      schemaVersion: "presenter-output-blanked.v1",
      tenantId: "tenant_1"
    });

    expect(eventPublisher.readPublishedEvents()).toMatchObject([
      {
        aggregateId: "presentation_1",
        eventType: "presenter.outputBlanked",
        payload: {
          outputTargetId: "output_main",
          presentationId: "presentation_1",
          tenantId: "tenant_1"
        },
        schemaVersion: "presenter-output-blanked.v1",
        tenantId: "tenant_1"
      }
    ]);
  });
});

type PresenterEventType =
  | "presentation.updated"
  | "presenter.slideChanged"
  | "presenter.outputBlanked"
  | "presenter.outputRestored";

const buildPresenterPayload = (eventType: PresenterEventType): Record<string, unknown> => {
  switch (eventType) {
    case "presentation.updated":
      return {
        changeKind: "metadata-updated",
        presentationId: "presentation_1",
        serviceId: "service_1",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T18:30:00.000Z"
      };
    case "presenter.slideChanged":
      return {
        activeSlideId: "slide_2",
        changeSource: "next",
        presentationId: "presentation_1",
        previousSlideId: "slide_1",
        tenantId: "tenant_1"
      };
    case "presenter.outputBlanked":
      return {
        blankedAt: "2026-06-16T18:30:00.000Z",
        outputTargetId: "output_main",
        presentationId: "presentation_1",
        reason: "Prayer",
        tenantId: "tenant_1"
      };
    case "presenter.outputRestored":
      return {
        outputTargetId: "output_main",
        presentationId: "presentation_1",
        restoredAt: "2026-06-16T18:30:00.000Z",
        tenantId: "tenant_1"
      };
  }
};

const buildPresenterSchemaVersion = (eventType: PresenterEventType): string => {
  switch (eventType) {
    case "presentation.updated":
      return "presenter-presentation-updated.v1";
    case "presenter.slideChanged":
      return "presenter-slide-changed.v1";
    case "presenter.outputBlanked":
      return "presenter-output-blanked.v1";
    case "presenter.outputRestored":
      return "presenter-output-restored.v1";
  }
};
