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
  schemaVersion: z.string().min(1),
  tenantId: z.string().min(1)
});

export const ReadinessUpdatedEventPayloadSchema = z.object({
  band: z.enum(["blocked", "needs-attention", "ready"]),
  readinessScore: z.number().int().min(0).max(100),
  serviceId: z.string().min(1)
});

export const ServicePublishedEventPayloadSchema = z.object({
  serviceId: z.string().min(1),
  status: z.literal("published")
});

export const AssignmentStatusChangedEventPayloadSchema = z.object({
  assignmentId: z.string().min(1),
  serviceId: z.string().min(1),
  status: z.enum(["pending", "confirmed", "declined"])
});

export type ApiEventType = z.infer<typeof ApiEventTypeSchema>;
export type ApiEventEnvelope = z.infer<typeof ApiEventEnvelopeSchema>;
export type ReadinessUpdatedEventPayload = z.infer<typeof ReadinessUpdatedEventPayloadSchema>;
export type ServicePublishedEventPayload = z.infer<typeof ServicePublishedEventPayloadSchema>;
export type AssignmentStatusChangedEventPayload = z.infer<
  typeof AssignmentStatusChangedEventPayloadSchema
>;

export interface EventPublisher {
  readonly publishAfterCommit: (event: ApiEventEnvelope) => Promise<void>;
}
