import { describe, expect, it } from "vitest";
import { createInMemoryEventPublisher } from "./index.js";

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
