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
    changeKind: z.enum([
      "created-from-service",
      "metadata-updated",
      "slide-added",
      "slide-updated",
      "slides-reordered",
      "slide-removed",
      "theme-applied",
      "output-target-set"
    ]),
    presentationId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    tenantId: z.string().min(1),
    updatedAt: z.string().datetime()
  })
  .strict();

export const PresenterSlideChangedEventPayloadSchema = z
  .object({
    activeSlideId: z.string().min(1),
    changeSource: z.enum(["load", "direct", "next", "previous"]),
    presentationId: z.string().min(1),
    previousSlideId: z.string().min(1).optional(),
    tenantId: z.string().min(1)
  })
  .strict();

export const PresenterOutputBlankedEventPayloadSchema = z
  .object({
    blankedAt: z.string().datetime(),
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
    restoredAt: z.string().datetime(),
    tenantId: z.string().min(1)
  })
  .strict();

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
      event.eventType !== "presentation.updated" &&
      event.eventType !== "presenter.slideChanged" &&
      event.eventType !== "presenter.outputBlanked" &&
      event.eventType !== "presenter.outputRestored"
    ) {
      return;
    }

    if (event.payload.tenantId !== event.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter event payload tenant must match envelope tenant.",
        path: ["payload", "tenantId"]
      });
    }

    if (event.payload.presentationId !== event.aggregateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Presenter event aggregate must match payload presentation.",
        path: ["aggregateId"]
      });
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

export const validateApiEventEnvelope = (
  rawEvent: ApiEventEnvelope
): ValidatedApiEventEnvelope => ValidatedApiEventEnvelopeSchema.parse(rawEvent);

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

const toEventPublisherError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Invalid API event envelope.");
