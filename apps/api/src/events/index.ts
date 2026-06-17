import { z } from "zod";

export const ApiEventTypeSchema = z.enum([
  "service.published",
  "assignment.statusChanged",
  "readiness.updated",
  "presentation.updated",
  "presenter.slideChanged",
  "presenter.outputBlanked",
  "presenter.outputRestored"
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
