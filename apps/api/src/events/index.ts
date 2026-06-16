import { z } from "zod";

export const ApiEventTypeSchema = z.enum([
  "service.published",
  "assignment.statusChanged",
  "readiness.updated"
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

export const ValidatedApiEventEnvelopeSchema = z.discriminatedUnion("eventType", [
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
  })
]);

export type ApiEventType = z.infer<typeof ApiEventTypeSchema>;
export type ApiEventEnvelope = z.infer<typeof ApiEventEnvelopeSchema>;
export type ValidatedApiEventEnvelope = z.infer<typeof ValidatedApiEventEnvelopeSchema>;
export type ReadinessUpdatedEventPayload = z.infer<typeof ReadinessUpdatedEventPayloadSchema>;
export type ServicePublishedEventPayload = z.infer<typeof ServicePublishedEventPayloadSchema>;
export type AssignmentStatusChangedEventPayload = z.infer<
  typeof AssignmentStatusChangedEventPayloadSchema
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
