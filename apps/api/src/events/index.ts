import { z } from "zod";

export const ApiEventTypeSchema = z.enum([
  "service.published",
  "assignment.statusChanged",
  "readiness.updated",
  "presentation.updated",
  "presenter.slideChanged",
  "presenter.outputBlanked",
  "presenter.outputRestored",
  "trackSet.updated",
  "play.playbackStateChanged",
  "play.cueFired",
  "community.memberUpdated",
  "community.attendanceRecorded",
  "community.communicationStatusChanged",
  "obs.connectionStatusChanged",
  "obs.streamStateChanged",
  "obs.recordingStateChanged",
  "obs.sceneChanged",
  "obs.actionStatusChanged"
]);

export const ApiEventEnvelopeSchema = z.object({
  aggregateId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  eventType: ApiEventTypeSchema,
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  requestId: z.string().min(1),
  schemaVersion: z.string().min(1),
  tenantId: z.string().min(1)
});

export const ReadinessUpdatedEventPayloadSchema = z
  .object({
    band: z.enum(["blocked", "needs-attention", "ready"]),
    readinessScore: z.number().int().min(0).max(100),
    serviceId: z.string().min(1)
  })
  .strict();

export const ServicePublishedEventPayloadSchema = z
  .object({
    serviceId: z.string().min(1),
    status: z.literal("published")
  })
  .strict();

export const AssignmentStatusChangedEventPayloadSchema = z
  .object({
    assignmentId: z.string().min(1),
    serviceId: z.string().min(1),
    status: z.enum(["pending", "confirmed", "declined"])
  })
  .strict();

export const PresentationUpdatedEventPayloadSchema = z
  .object({
    changeKind: z.enum(["created", "updated"]),
    presentationId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime()
  })
  .strict();

export const PresenterSlideChangedEventPayloadSchema = z
  .object({
    activeSlideId: z.string().min(1),
    previousSlideId: z.string().min(1).optional(),
    presentationId: z.string().min(1),
    tenantId: z.string().min(1)
  })
  .strict();

export const PresenterOutputBlankedEventPayloadSchema = z
  .object({
    outputTargetId: z.string().min(1).optional(),
    presentationId: z.string().min(1),
    reason: z.string().min(1).optional(),
    tenantId: z.string().min(1)
  })
  .strict();

export const PresenterOutputRestoredEventPayloadSchema = z
  .object({
    outputTargetId: z.string().min(1).optional(),
    presentationId: z.string().min(1),
    tenantId: z.string().min(1)
  })
  .strict();

export const TrackSetUpdatedEventPayloadSchema = z
  .object({
    changeKind: z.enum(["created", "updated"]),
    tenantId: z.string().min(1),
    trackSetId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const PlayPlaybackStateChangedEventPayloadSchema = z
  .object({
    activePadLayerRef: z.string().min(1).optional(),
    activeSectionRef: z.string().min(1).optional(),
    clickEnabled: z.boolean(),
    positionBeats: z.number().nonnegative(),
    tenantId: z.string().min(1),
    trackSetId: z.string().min(1),
    transportStatus: z.enum(["stopped", "playing", "paused"]),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const PlayCueFiredEventPayloadSchema = z
  .object({
    action: z.enum(["play", "stop", "jump", "pad-change", "click-toggle"]),
    cueId: z.string().min(1),
    firedAt: z.string().datetime({ offset: true }),
    tenantId: z.string().min(1),
    trackSetId: z.string().min(1)
  })
  .strict();

/**
 * Community+ is the strictest PII surface in the system, so its event payloads
 * carry **only opaque references, coarse status/change fields, and counts** —
 * never a name, contact value, message body, household label, custom-field
 * value, or any free text. `.strict()` rejects every unrecognized key, so a
 * subscriber can never learn PII from a Community+ event: `memberId`,
 * `householdRef`, `memberRef`, `occasionRef`, and `messageId` are opaque IDs,
 * and the only non-ID fields are enums (`status`, `changeKind`, `recordKind`,
 * `channel`, `origin`) and a positive-integer `headcount`.
 */
export const CommunityMemberUpdatedEventPayloadSchema = z
  .object({
    changeKind: z.enum(["created", "updated", "archived"]),
    householdRef: z.string().min(1).optional(),
    memberId: z.string().min(1),
    status: z.enum(["active", "inactive", "visitor", "archived"]),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const CommunityAttendanceRecordedEventPayloadSchema = z
  .object({
    attendanceId: z.string().min(1),
    changeKind: z.enum(["created", "updated"]),
    headcount: z.number().int().positive().optional(),
    memberRef: z.string().min(1).optional(),
    occasionRef: z.string().min(1),
    recordKind: z.enum(["member", "headcount"]),
    status: z.enum(["present", "absent", "excused"]).optional(),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const CommunityCommunicationStatusChangedEventPayloadSchema = z
  .object({
    channel: z.enum(["sms", "email", "push"]),
    messageId: z.string().min(1),
    origin: z.enum(["human", "ai-drafted"]),
    status: z.enum([
      "draft",
      "reviewed",
      "confirmed",
      "queued",
      "sent",
      "failed",
      "canceled"
    ]),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

/**
 * OBS controls live, public-facing output and resolves its credentials through a
 * separate secret/vault boundary, so its event payloads are the system's
 * strictest "secret-free **and** PII-free" surface. Every OBS payload carries
 * **only opaque references, coarse status/kind/origin enums, and timestamps** —
 * never an OBS host/port/password/auth token/stream key, never a raw
 * obs-websocket payload, never bitrate/uptime/dropped-frame/per-frame telemetry,
 * and never PII (OBS controls production hardware/scenes, not people; no PII is
 * expected and the shapes provide nowhere to put it). `.strict()` rejects every
 * unrecognized key, so a subscriber can never learn a secret or a high-frequency
 * stat from an OBS event: `connectionProfileId`, `actionIntentId`, and
 * `programSceneRef` are opaque IDs/refs, and the only non-ID/ref fields are enums
 * (`connectionStatus`, `streamStatus`, `recordingStatus`, `kind`, `origin`,
 * `status`) and ISO timestamps. High-frequency telemetry stays on the local
 * runtime bus and is intentionally excluded from the union.
 */
export const ObsConnectionStatusChangedEventPayloadSchema = z
  .object({
    connectionProfileId: z.string().min(1),
    connectionStatus: z.enum(["connected", "disconnected", "unknown"]),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const ObsStreamStateChangedEventPayloadSchema = z
  .object({
    connectionProfileId: z.string().min(1),
    lastActionIntentRef: z.string().min(1).optional(),
    lastTransitionAt: z.string().datetime({ offset: true }).optional(),
    streamStatus: z.enum(["active", "inactive", "unknown"]),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const ObsRecordingStateChangedEventPayloadSchema = z
  .object({
    connectionProfileId: z.string().min(1),
    lastTransitionAt: z.string().datetime({ offset: true }).optional(),
    recordingStatus: z.enum(["active", "paused", "inactive", "unknown"]),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const ObsSceneChangedEventPayloadSchema = z
  .object({
    connectionProfileId: z.string().min(1),
    programSceneRef: z.string().min(1).optional(),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

export const ObsActionStatusChangedEventPayloadSchema = z
  .object({
    actionIntentId: z.string().min(1),
    connectionProfileId: z.string().min(1),
    kind: z.enum([
      "start-stream",
      "stop-stream",
      "switch-scene",
      "toggle-source-visibility",
      "toggle-source-mute"
    ]),
    origin: z.enum(["human", "ai-suggested"]),
    status: z.enum([
      "requested",
      "confirmed",
      "dispatched",
      "succeeded",
      "failed",
      "canceled"
    ]),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();

const validatePresenterEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly presentationId: string;
      readonly tenantId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Presenter event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.presentationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Presenter event aggregate must match presentation ID.",
      path: ["aggregateId"]
    });
  }
};

const validatePlayEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly tenantId: string;
      readonly trackSetId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Play event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.trackSetId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Play event aggregate must match track set ID.",
      path: ["aggregateId"]
    });
  }
};

const validateCommunityMemberEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly memberId: string;
      readonly tenantId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Community event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.memberId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Community event aggregate must match member ID.",
      path: ["aggregateId"]
    });
  }
};

const validateCommunityAttendanceEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly attendanceId: string;
      readonly tenantId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Community event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.attendanceId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Community event aggregate must match attendance ID.",
      path: ["aggregateId"]
    });
  }
};

const validateCommunityCommunicationEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly messageId: string;
      readonly tenantId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Community event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.messageId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Community event aggregate must match message ID.",
      path: ["aggregateId"]
    });
  }
};

/**
 * The connection/stream/recording/scene OBS events are all scoped to a single
 * `ObsConnectionProfile`, so they share one aggregate-scope check: the envelope
 * tenant must match the payload tenant, and the envelope aggregate must be the
 * `connectionProfileId`. (The action-status event is scoped to its action intent
 * instead — see `validateObsActionEventScope`.)
 */
const validateObsConnectionScopedEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly connectionProfileId: string;
      readonly tenantId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OBS event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.connectionProfileId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OBS event aggregate must match connection profile ID.",
      path: ["aggregateId"]
    });
  }
};

const validateObsActionEventScope = (
  event: {
    readonly aggregateId: string;
    readonly payload: {
      readonly actionIntentId: string;
      readonly tenantId: string;
    };
    readonly tenantId: string;
  },
  context: z.RefinementCtx
): void => {
  if (event.tenantId !== event.payload.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OBS event tenant must match payload tenant.",
      path: ["payload", "tenantId"]
    });
  }

  if (event.aggregateId !== event.payload.actionIntentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OBS event aggregate must match action intent ID.",
      path: ["aggregateId"]
    });
  }
};

const ValidatedApiEventEnvelopeBaseSchema = z.discriminatedUnion("eventType", [
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("service.published"),
    payload: ServicePublishedEventPayloadSchema,
    schemaVersion: z.literal("planning-service-published.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("assignment.statusChanged"),
    payload: AssignmentStatusChangedEventPayloadSchema,
    schemaVersion: z.literal("planning-assignment-status.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("readiness.updated"),
    payload: ReadinessUpdatedEventPayloadSchema,
    schemaVersion: z.literal("planning-readiness.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("presentation.updated"),
    payload: PresentationUpdatedEventPayloadSchema,
    schemaVersion: z.literal("presenter-presentation-updated.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("presenter.slideChanged"),
    payload: PresenterSlideChangedEventPayloadSchema,
    schemaVersion: z.literal("presenter-slide-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("presenter.outputBlanked"),
    payload: PresenterOutputBlankedEventPayloadSchema,
    schemaVersion: z.literal("presenter-output-blanked.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("presenter.outputRestored"),
    payload: PresenterOutputRestoredEventPayloadSchema,
    schemaVersion: z.literal("presenter-output-restored.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("trackSet.updated"),
    payload: TrackSetUpdatedEventPayloadSchema,
    schemaVersion: z.literal("play-track-set-updated.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("play.playbackStateChanged"),
    payload: PlayPlaybackStateChangedEventPayloadSchema,
    schemaVersion: z.literal("play-playback-state-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("play.cueFired"),
    payload: PlayCueFiredEventPayloadSchema,
    schemaVersion: z.literal("play-cue-fired.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("community.memberUpdated"),
    payload: CommunityMemberUpdatedEventPayloadSchema,
    schemaVersion: z.literal("community-member-updated.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("community.attendanceRecorded"),
    payload: CommunityAttendanceRecordedEventPayloadSchema,
    schemaVersion: z.literal("community-attendance-recorded.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("community.communicationStatusChanged"),
    payload: CommunityCommunicationStatusChangedEventPayloadSchema,
    schemaVersion: z.literal("community-communication-status-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("obs.connectionStatusChanged"),
    payload: ObsConnectionStatusChangedEventPayloadSchema,
    schemaVersion: z.literal("obs-connection-status-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("obs.streamStateChanged"),
    payload: ObsStreamStateChangedEventPayloadSchema,
    schemaVersion: z.literal("obs-stream-state-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("obs.recordingStateChanged"),
    payload: ObsRecordingStateChangedEventPayloadSchema,
    schemaVersion: z.literal("obs-recording-state-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("obs.sceneChanged"),
    payload: ObsSceneChangedEventPayloadSchema,
    schemaVersion: z.literal("obs-scene-changed.v1")
  }),
  ApiEventEnvelopeSchema.extend({
    eventType: z.literal("obs.actionStatusChanged"),
    payload: ObsActionStatusChangedEventPayloadSchema,
    schemaVersion: z.literal("obs-action-status-changed.v1")
  })
]);

export const ValidatedApiEventEnvelopeSchema =
  ValidatedApiEventEnvelopeBaseSchema.superRefine((event, context) => {
    if (
      event.eventType === "presentation.updated" ||
      event.eventType === "presenter.slideChanged" ||
      event.eventType === "presenter.outputBlanked" ||
      event.eventType === "presenter.outputRestored"
    ) {
      validatePresenterEventScope(event, context);
    }

    if (
      event.eventType === "trackSet.updated" ||
      event.eventType === "play.playbackStateChanged" ||
      event.eventType === "play.cueFired"
    ) {
      validatePlayEventScope(event, context);
    }

    if (event.eventType === "community.memberUpdated") {
      validateCommunityMemberEventScope(event, context);
    }

    if (event.eventType === "community.attendanceRecorded") {
      validateCommunityAttendanceEventScope(event, context);
    }

    if (event.eventType === "community.communicationStatusChanged") {
      validateCommunityCommunicationEventScope(event, context);
    }

    if (
      event.eventType === "obs.connectionStatusChanged" ||
      event.eventType === "obs.streamStateChanged" ||
      event.eventType === "obs.recordingStateChanged" ||
      event.eventType === "obs.sceneChanged"
    ) {
      validateObsConnectionScopedEventScope(event, context);
    }

    if (event.eventType === "obs.actionStatusChanged") {
      validateObsActionEventScope(event, context);
    }
  });

export type ApiEventType = z.infer<typeof ApiEventTypeSchema>;
export type ApiEventEnvelope = z.infer<typeof ApiEventEnvelopeSchema>;
export type ValidatedApiEventEnvelope = z.infer<typeof ValidatedApiEventEnvelopeSchema>;
export type ReadinessUpdatedEventPayload = z.infer<typeof ReadinessUpdatedEventPayloadSchema>;
export type ServicePublishedEventPayload = z.infer<typeof ServicePublishedEventPayloadSchema>;
export type AssignmentStatusChangedEventPayload = z.infer<
  typeof AssignmentStatusChangedEventPayloadSchema
>;
export type PresentationUpdatedEventPayload = z.infer<
  typeof PresentationUpdatedEventPayloadSchema
>;
export type PresenterSlideChangedEventPayload = z.infer<
  typeof PresenterSlideChangedEventPayloadSchema
>;
export type PresenterOutputBlankedEventPayload = z.infer<
  typeof PresenterOutputBlankedEventPayloadSchema
>;
export type PresenterOutputRestoredEventPayload = z.infer<
  typeof PresenterOutputRestoredEventPayloadSchema
>;
export type TrackSetUpdatedEventPayload = z.infer<
  typeof TrackSetUpdatedEventPayloadSchema
>;
export type PlayPlaybackStateChangedEventPayload = z.infer<
  typeof PlayPlaybackStateChangedEventPayloadSchema
>;
export type PlayCueFiredEventPayload = z.infer<typeof PlayCueFiredEventPayloadSchema>;
export type CommunityMemberUpdatedEventPayload = z.infer<
  typeof CommunityMemberUpdatedEventPayloadSchema
>;
export type CommunityAttendanceRecordedEventPayload = z.infer<
  typeof CommunityAttendanceRecordedEventPayloadSchema
>;
export type CommunityCommunicationStatusChangedEventPayload = z.infer<
  typeof CommunityCommunicationStatusChangedEventPayloadSchema
>;
export type ObsConnectionStatusChangedEventPayload = z.infer<
  typeof ObsConnectionStatusChangedEventPayloadSchema
>;
export type ObsStreamStateChangedEventPayload = z.infer<
  typeof ObsStreamStateChangedEventPayloadSchema
>;
export type ObsRecordingStateChangedEventPayload = z.infer<
  typeof ObsRecordingStateChangedEventPayloadSchema
>;
export type ObsSceneChangedEventPayload = z.infer<
  typeof ObsSceneChangedEventPayloadSchema
>;
export type ObsActionStatusChangedEventPayload = z.infer<
  typeof ObsActionStatusChangedEventPayloadSchema
>;

export interface EventPublisher {
  readonly publishAfterCommit: (event: ApiEventEnvelope) => Promise<void>;
}

export interface InMemoryEventPublisher extends EventPublisher {
  readonly readPublishedEvents: () => readonly ValidatedApiEventEnvelope[];
  readonly clear: () => void;
}

export const ApiEventTransportRouteSchema = z
  .object({
    aggregateId: z.string().min(1),
    eventType: ApiEventTypeSchema,
    tenantId: z.string().min(1)
  })
  .strict();

export const ApiEventTransportMessageSchema = z
  .object({
    event: ValidatedApiEventEnvelopeSchema,
    messageType: z.literal("api.event"),
    route: ApiEventTransportRouteSchema
  })
  .strict()
  .superRefine((message, context) => {
    if (message.route.tenantId !== message.event.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API event transport tenant route must match event tenant.",
        path: ["route", "tenantId"]
      });
    }

    if (message.route.aggregateId !== message.event.aggregateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API event transport aggregate route must match event aggregate.",
        path: ["route", "aggregateId"]
      });
    }

    if (message.route.eventType !== message.event.eventType) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API event transport type route must match event type.",
        path: ["route", "eventType"]
      });
    }
  });

export const ApiEventTransportSubscriptionSchema = z
  .object({
    aggregateId: z.string().min(1).optional(),
    eventTypes: z.array(ApiEventTypeSchema).min(1).optional(),
    subscriptionId: z.string().min(1),
    tenantId: z.string().min(1)
  })
  .strict();

export const validateApiEventEnvelope = (
  rawEvent: ApiEventEnvelope
): ValidatedApiEventEnvelope => ValidatedApiEventEnvelopeSchema.parse(rawEvent);

export type ApiEventTransportRoute = z.infer<typeof ApiEventTransportRouteSchema>;
export type ApiEventTransportMessage = z.infer<typeof ApiEventTransportMessageSchema>;
export type ApiEventTransportSubscription = z.infer<
  typeof ApiEventTransportSubscriptionSchema
>;

export interface ApiEventTransportClient {
  readonly send: (message: ApiEventTransportMessage) => Promise<void>;
}

export interface ApiEventTransportDelivery {
  readonly message: ApiEventTransportMessage;
  readonly subscriptionId: string;
}

export interface InMemoryApiEventTransportClient extends ApiEventTransportClient {
  readonly clear: () => void;
  readonly readDeliveries: () => readonly ApiEventTransportDelivery[];
  readonly readSubscriptions: () => readonly ApiEventTransportSubscription[];
  readonly subscribe: (
    subscription: ApiEventTransportSubscription
  ) => ApiEventTransportSubscription;
  readonly unsubscribe: (subscriptionId: string) => boolean;
}

export const createInMemoryEventPublisher = (): InMemoryEventPublisher => {
  const publishedEvents: ValidatedApiEventEnvelope[] = [];

  return {
    clear: (): void => {
      publishedEvents.length = 0;
    },
    publishAfterCommit: (event: ApiEventEnvelope): Promise<void> => {
      try {
        const validatedEvent = validateApiEventEnvelope(event);
        publishedEvents.push(validatedEvent);
        return Promise.resolve();
      } catch (error: unknown) {
        return Promise.reject(toEventPublisherError(error));
      }
    },
    readPublishedEvents: (): readonly ValidatedApiEventEnvelope[] => [...publishedEvents]
  };
};

export const createApiEventTransportPublisher = (
  client: ApiEventTransportClient
): EventPublisher => ({
  publishAfterCommit: (event: ApiEventEnvelope): Promise<void> => {
    try {
      const validatedEvent = validateApiEventEnvelope(event);

      return client.send(
        ApiEventTransportMessageSchema.parse({
          event: validatedEvent,
          messageType: "api.event",
          route: {
            aggregateId: validatedEvent.aggregateId,
            eventType: validatedEvent.eventType,
            tenantId: validatedEvent.tenantId
          }
        })
      );
    } catch (error: unknown) {
      return Promise.reject(toEventPublisherError(error));
    }
  }
});

export const createInMemoryApiEventTransportClient =
  (): InMemoryApiEventTransportClient => {
    const subscriptions = new Map<string, ApiEventTransportSubscription>();
    const deliveries: ApiEventTransportDelivery[] = [];

    return {
      clear: (): void => {
        deliveries.length = 0;
        subscriptions.clear();
      },
      readDeliveries: (): readonly ApiEventTransportDelivery[] =>
        deliveries.map((delivery) => ({
          message: delivery.message,
          subscriptionId: delivery.subscriptionId
        })),
      readSubscriptions: (): readonly ApiEventTransportSubscription[] => [
        ...subscriptions.values()
      ],
      send: (rawMessage: ApiEventTransportMessage): Promise<void> => {
        try {
          const message = ApiEventTransportMessageSchema.parse(rawMessage);

          for (const subscription of subscriptions.values()) {
            if (matchesSubscription(message, subscription)) {
              deliveries.push({
                message,
                subscriptionId: subscription.subscriptionId
              });
            }
          }

          return Promise.resolve();
        } catch (error: unknown) {
          return Promise.reject(toEventPublisherError(error));
        }
      },
      subscribe: (
        subscription: ApiEventTransportSubscription
      ): ApiEventTransportSubscription => {
        const parsedSubscription =
          ApiEventTransportSubscriptionSchema.parse(subscription);
        subscriptions.set(
          parsedSubscription.subscriptionId,
          parsedSubscription
        );

        return parsedSubscription;
      },
      unsubscribe: (subscriptionId: string): boolean =>
        subscriptions.delete(subscriptionId)
    };
  };

const matchesSubscription = (
  message: ApiEventTransportMessage,
  subscription: ApiEventTransportSubscription
): boolean =>
  subscription.tenantId === message.route.tenantId &&
  (subscription.aggregateId === undefined ||
    subscription.aggregateId === message.route.aggregateId) &&
  (subscription.eventTypes === undefined ||
    subscription.eventTypes.includes(message.route.eventType));

const toEventPublisherError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Invalid API event envelope.");
