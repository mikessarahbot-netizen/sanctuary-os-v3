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

export type ApiEventType = z.infer<typeof ApiEventTypeSchema>;
export type ApiEventEnvelope = z.infer<typeof ApiEventEnvelopeSchema>;
export type ReadinessUpdatedEventPayload = z.infer<typeof ReadinessUpdatedEventPayloadSchema>;

export interface EventPublisher {
  readonly publishAfterCommit: (event: ApiEventEnvelope) => Promise<void>;
}
