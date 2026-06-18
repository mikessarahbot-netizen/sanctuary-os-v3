import { describe, expect, it } from "vitest";
import {
  ApiEventTransportMessageSchema,
  createApiEventTransportPublisher,
  createInMemoryApiEventTransportClient,
  createInMemoryEventPublisher,
  validateApiEventEnvelope,
  type ApiEventEnvelope
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

  it("validates Play event payload contracts and schema versions", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    await eventPublisher.publishAfterCommit({
      aggregateId: "track_set_1",
      actorId: "actor_1",
      eventType: "trackSet.updated",
      occurredAt: "2026-06-16T22:10:00.000Z",
      payload: {
        changeKind: "updated",
        tenantId: "tenant_1",
        trackSetId: "track_set_1",
        updatedAt: "2026-06-16T22:10:00.000Z"
      },
      requestId: "request_track_set_updated",
      schemaVersion: "play-track-set-updated.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "track_set_1",
      actorId: "actor_1",
      eventType: "play.playbackStateChanged",
      occurredAt: "2026-06-16T22:11:00.000Z",
      payload: {
        activePadLayerRef: "pad_layer_1",
        activeSectionRef: "section_intro",
        clickEnabled: true,
        positionBeats: 8,
        tenantId: "tenant_1",
        trackSetId: "track_set_1",
        transportStatus: "playing",
        updatedAt: "2026-06-16T22:11:00.000Z"
      },
      requestId: "request_playback_state_changed",
      schemaVersion: "play-playback-state-changed.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "track_set_1",
      actorId: "actor_1",
      eventType: "play.cueFired",
      occurredAt: "2026-06-16T22:12:00.000Z",
      payload: {
        action: "play",
        cueId: "cue_1",
        firedAt: "2026-06-16T22:12:00.000Z",
        tenantId: "tenant_1",
        trackSetId: "track_set_1"
      },
      requestId: "request_cue_fired",
      schemaVersion: "play-cue-fired.v1",
      tenantId: "tenant_1"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        eventType: event.eventType,
        schemaVersion: event.schemaVersion
      }))
    ).toEqual([
      {
        eventType: "trackSet.updated",
        schemaVersion: "play-track-set-updated.v1"
      },
      {
        eventType: "play.playbackStateChanged",
        schemaVersion: "play-playback-state-changed.v1"
      },
      {
        eventType: "play.cueFired",
        schemaVersion: "play-cue-fired.v1"
      }
    ]);
  });

  it("rejects Play event tenant and aggregate mismatches", () => {
    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "track_set_1",
        actorId: "actor_1",
        eventType: "play.playbackStateChanged",
        occurredAt: "2026-06-16T22:11:00.000Z",
        payload: {
          clickEnabled: true,
          positionBeats: 0,
          tenantId: "tenant_2",
          trackSetId: "track_set_1",
          transportStatus: "stopped",
          updatedAt: "2026-06-16T22:11:00.000Z"
        },
        requestId: "request_playback_state_changed",
        schemaVersion: "play-playback-state-changed.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Play event tenant must match payload tenant.");

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "track_set_2",
        actorId: "actor_1",
        eventType: "trackSet.updated",
        occurredAt: "2026-06-16T22:10:00.000Z",
        payload: {
          changeKind: "updated",
          tenantId: "tenant_1",
          trackSetId: "track_set_1",
          updatedAt: "2026-06-16T22:10:00.000Z"
        },
        requestId: "request_track_set_updated",
        schemaVersion: "play-track-set-updated.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Play event aggregate must match track set ID.");

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "track_set_2",
        actorId: "actor_1",
        eventType: "play.cueFired",
        occurredAt: "2026-06-16T22:12:00.000Z",
        payload: {
          action: "play",
          cueId: "cue_1",
          firedAt: "2026-06-16T22:12:00.000Z",
          tenantId: "tenant_1",
          trackSetId: "track_set_1"
        },
        requestId: "request_cue_fired",
        schemaVersion: "play-cue-fired.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Play event aggregate must match track set ID.");
  });

  it("rejects Play event payloads with raw media, playhead, or secret fields", () => {
    const baseEvent = {
      aggregateId: "track_set_1",
      actorId: "actor_1",
      eventType: "play.playbackStateChanged" as const,
      occurredAt: "2026-06-16T22:11:00.000Z",
      payload: {
        clickEnabled: true,
        positionBeats: 0,
        tenantId: "tenant_1",
        trackSetId: "track_set_1",
        transportStatus: "stopped" as const,
        updatedAt: "2026-06-16T22:11:00.000Z"
      },
      requestId: "request_playback_state_changed",
      schemaVersion: "play-playback-state-changed.v1" as const,
      tenantId: "tenant_1"
    };

    expect(() =>
      validateApiEventEnvelope({
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          playheadSampleOffset: 44100
        }
      })
    ).toThrow("Unrecognized key");

    expect(() =>
      validateApiEventEnvelope({
        ...baseEvent,
        payload: {
          ...baseEvent.payload,
          rawAudioPayload: "base64"
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

  it("validates Community event payload contracts and schema versions", async () => {
    const eventPublisher = createInMemoryEventPublisher();

    await eventPublisher.publishAfterCommit({
      aggregateId: "member_1",
      actorId: "actor_1",
      eventType: "community.memberUpdated",
      occurredAt: "2026-06-21T14:30:00.000Z",
      payload: {
        changeKind: "updated",
        householdRef: "household_1",
        memberId: "member_1",
        status: "active",
        tenantId: "tenant_1",
        updatedAt: "2026-06-21T14:30:00.000Z"
      },
      requestId: "request_member_updated",
      schemaVersion: "community-member-updated.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "attendance_1",
      actorId: "actor_1",
      eventType: "community.attendanceRecorded",
      occurredAt: "2026-06-21T14:31:00.000Z",
      payload: {
        attendanceId: "attendance_1",
        changeKind: "created",
        memberRef: "member_1",
        occasionRef: "occasion_1",
        recordKind: "member",
        status: "present",
        tenantId: "tenant_1",
        updatedAt: "2026-06-21T14:31:00.000Z"
      },
      requestId: "request_attendance_recorded",
      schemaVersion: "community-attendance-recorded.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "attendance_2",
      actorId: "actor_1",
      eventType: "community.attendanceRecorded",
      occurredAt: "2026-06-21T14:32:00.000Z",
      payload: {
        attendanceId: "attendance_2",
        changeKind: "created",
        headcount: 42,
        occasionRef: "occasion_1",
        recordKind: "headcount",
        tenantId: "tenant_1",
        updatedAt: "2026-06-21T14:32:00.000Z"
      },
      requestId: "request_headcount_recorded",
      schemaVersion: "community-attendance-recorded.v1",
      tenantId: "tenant_1"
    });
    await eventPublisher.publishAfterCommit({
      aggregateId: "message_1",
      actorId: "actor_1",
      eventType: "community.communicationStatusChanged",
      occurredAt: "2026-06-21T14:33:00.000Z",
      payload: {
        channel: "sms",
        messageId: "message_1",
        origin: "human",
        status: "queued",
        tenantId: "tenant_1",
        updatedAt: "2026-06-21T14:33:00.000Z"
      },
      requestId: "request_comms_status",
      schemaVersion: "community-communication-status-changed.v1",
      tenantId: "tenant_1"
    });

    expect(
      eventPublisher.readPublishedEvents().map((event) => ({
        eventType: event.eventType,
        schemaVersion: event.schemaVersion
      }))
    ).toEqual([
      {
        eventType: "community.memberUpdated",
        schemaVersion: "community-member-updated.v1"
      },
      {
        eventType: "community.attendanceRecorded",
        schemaVersion: "community-attendance-recorded.v1"
      },
      {
        eventType: "community.attendanceRecorded",
        schemaVersion: "community-attendance-recorded.v1"
      },
      {
        eventType: "community.communicationStatusChanged",
        schemaVersion: "community-communication-status-changed.v1"
      }
    ]);
  });

  it("rejects Community event tenant and aggregate mismatches", () => {
    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "member_1",
        actorId: "actor_1",
        eventType: "community.memberUpdated",
        occurredAt: "2026-06-21T14:30:00.000Z",
        payload: {
          changeKind: "updated",
          memberId: "member_1",
          status: "active",
          tenantId: "tenant_2",
          updatedAt: "2026-06-21T14:30:00.000Z"
        },
        requestId: "request_member_updated",
        schemaVersion: "community-member-updated.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Community event tenant must match payload tenant.");

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "member_2",
        actorId: "actor_1",
        eventType: "community.memberUpdated",
        occurredAt: "2026-06-21T14:30:00.000Z",
        payload: {
          changeKind: "updated",
          memberId: "member_1",
          status: "active",
          tenantId: "tenant_1",
          updatedAt: "2026-06-21T14:30:00.000Z"
        },
        requestId: "request_member_updated",
        schemaVersion: "community-member-updated.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Community event aggregate must match member ID.");

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "attendance_2",
        actorId: "actor_1",
        eventType: "community.attendanceRecorded",
        occurredAt: "2026-06-21T14:31:00.000Z",
        payload: {
          attendanceId: "attendance_1",
          changeKind: "created",
          memberRef: "member_1",
          occasionRef: "occasion_1",
          recordKind: "member",
          status: "present",
          tenantId: "tenant_1",
          updatedAt: "2026-06-21T14:31:00.000Z"
        },
        requestId: "request_attendance_recorded",
        schemaVersion: "community-attendance-recorded.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Community event aggregate must match attendance ID.");

    expect(() =>
      validateApiEventEnvelope({
        aggregateId: "message_2",
        actorId: "actor_1",
        eventType: "community.communicationStatusChanged",
        occurredAt: "2026-06-21T14:33:00.000Z",
        payload: {
          channel: "sms",
          messageId: "message_1",
          origin: "human",
          status: "queued",
          tenantId: "tenant_1",
          updatedAt: "2026-06-21T14:33:00.000Z"
        },
        requestId: "request_comms_status",
        schemaVersion: "community-communication-status-changed.v1",
        tenantId: "tenant_1"
      })
    ).toThrow("Community event aggregate must match message ID.");
  });

  it("rejects Community event payloads carrying any name, contact, or body PII field", () => {
    const memberBaseEvent = {
      aggregateId: "member_1",
      actorId: "actor_1",
      eventType: "community.memberUpdated" as const,
      occurredAt: "2026-06-21T14:30:00.000Z",
      payload: {
        changeKind: "updated" as const,
        memberId: "member_1",
        status: "active" as const,
        tenantId: "tenant_1",
        updatedAt: "2026-06-21T14:30:00.000Z"
      },
      requestId: "request_member_updated",
      schemaVersion: "community-member-updated.v1" as const,
      tenantId: "tenant_1"
    };

    for (const piiKey of [
      "name",
      "displayName",
      "phone",
      "email",
      "address",
      "contact"
    ]) {
      expect(() =>
        validateApiEventEnvelope({
          ...memberBaseEvent,
          payload: {
            ...memberBaseEvent.payload,
            [piiKey]: "Jane Doe"
          }
        })
      ).toThrow("Unrecognized key");
    }

    // The communications event is status + ids only: it must reject a message
    // body, subject, or recipient contact value just as hard.
    const commsBaseEvent = {
      aggregateId: "message_1",
      actorId: "actor_1",
      eventType: "community.communicationStatusChanged" as const,
      occurredAt: "2026-06-21T14:33:00.000Z",
      payload: {
        channel: "sms" as const,
        messageId: "message_1",
        origin: "human" as const,
        status: "queued" as const,
        tenantId: "tenant_1",
        updatedAt: "2026-06-21T14:33:00.000Z"
      },
      requestId: "request_comms_status",
      schemaVersion: "community-communication-status-changed.v1" as const,
      tenantId: "tenant_1"
    };

    for (const leakKey of [
      "bodyTemplate",
      "subject",
      "displayName",
      "phone",
      "email",
      "recipientContact"
    ]) {
      expect(() =>
        validateApiEventEnvelope({
          ...commsBaseEvent,
          payload: {
            ...commsBaseEvent.payload,
            [leakKey]: "leaked"
          }
        })
      ).toThrow("Unrecognized key");
    }
  });
});

describe("API event transport", () => {
  const presentationUpdatedEvent: ApiEventEnvelope = {
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
  };
  const slideChangedEvent: ApiEventEnvelope = {
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
  };

  it("dispatches validated Presenter events to tenant-scoped subscriptions in order", async () => {
    const client = createInMemoryApiEventTransportClient();
    const publisher = createApiEventTransportPublisher(client);

    client.subscribe({
      eventTypes: ["presentation.updated", "presenter.slideChanged"],
      subscriptionId: "subscription_presenter_1",
      tenantId: "tenant_1"
    });
    client.subscribe({
      eventTypes: ["presenter.slideChanged"],
      subscriptionId: "subscription_other_tenant",
      tenantId: "tenant_2"
    });

    await publisher.publishAfterCommit(presentationUpdatedEvent);
    await publisher.publishAfterCommit(slideChangedEvent);

    expect(
      client.readDeliveries().map((delivery) => ({
        eventType: delivery.message.event.eventType,
        route: delivery.message.route,
        subscriptionId: delivery.subscriptionId
      }))
    ).toEqual([
      {
        eventType: "presentation.updated",
        route: {
          aggregateId: "presentation_1",
          eventType: "presentation.updated",
          tenantId: "tenant_1"
        },
        subscriptionId: "subscription_presenter_1"
      },
      {
        eventType: "presenter.slideChanged",
        route: {
          aggregateId: "presentation_1",
          eventType: "presenter.slideChanged",
          tenantId: "tenant_1"
        },
        subscriptionId: "subscription_presenter_1"
      }
    ]);
  });

  it("supports aggregate-scoped subscriptions and unsubscribe behavior", async () => {
    const client = createInMemoryApiEventTransportClient();
    const publisher = createApiEventTransportPublisher(client);

    client.subscribe({
      aggregateId: "presentation_1",
      eventTypes: ["presenter.slideChanged"],
      subscriptionId: "subscription_presentation_1",
      tenantId: "tenant_1"
    });
    client.subscribe({
      aggregateId: "presentation_2",
      eventTypes: ["presenter.slideChanged"],
      subscriptionId: "subscription_presentation_2",
      tenantId: "tenant_1"
    });

    await publisher.publishAfterCommit(slideChangedEvent);
    expect(client.readDeliveries()).toHaveLength(1);
    expect(client.readDeliveries()[0]?.subscriptionId).toBe(
      "subscription_presentation_1"
    );
    expect(client.unsubscribe("subscription_presentation_1")).toBe(true);

    await publisher.publishAfterCommit(slideChangedEvent);
    expect(client.readDeliveries()).toHaveLength(1);
  });

  it("rejects malformed Presenter envelopes before transport delivery", async () => {
    const client = createInMemoryApiEventTransportClient();
    const publisher = createApiEventTransportPublisher(client);

    client.subscribe({
      subscriptionId: "subscription_presenter_1",
      tenantId: "tenant_1"
    });

    await expect(
      publisher.publishAfterCommit({
        ...slideChangedEvent,
        payload: {
          activeSlideId: "slide_2",
          presentationId: "presentation_2",
          tenantId: "tenant_1"
        }
      })
    ).rejects.toThrow("Presenter event aggregate must match presentation ID.");
    expect(client.readDeliveries()).toEqual([]);
  });

  it("rejects transport messages whose route metadata does not match the event", () => {
    expect(() =>
      ApiEventTransportMessageSchema.parse({
        event: validateApiEventEnvelope(slideChangedEvent),
        messageType: "api.event",
        route: {
          aggregateId: "presentation_1",
          eventType: "presenter.outputBlanked",
          tenantId: "tenant_1"
        }
      })
    ).toThrow("API event transport type route must match event type.");
  });

  it("does not transport Presenter payloads with OBS, stream, raw media, or secret fields", async () => {
    const client = createInMemoryApiEventTransportClient();
    const publisher = createApiEventTransportPublisher(client);

    client.subscribe({
      eventTypes: ["presenter.outputBlanked"],
      subscriptionId: "subscription_presenter_1",
      tenantId: "tenant_1"
    });

    await expect(
      publisher.publishAfterCommit({
        aggregateId: "presentation_1",
        actorId: "actor_1",
        eventType: "presenter.outputBlanked",
        occurredAt: "2026-06-16T21:22:00.000Z",
        payload: {
          obsScene: "scene_main",
          presentationId: "presentation_1",
          rawMediaPayload: "base64",
          startStream: true,
          tenantId: "tenant_1",
          vendorToken: "secret"
        },
        requestId: "request_output_blanked",
        schemaVersion: "presenter-output-blanked.v1",
        tenantId: "tenant_1"
      })
    ).rejects.toThrow("Unrecognized key");
    expect(client.readDeliveries()).toEqual([]);
  });
});
