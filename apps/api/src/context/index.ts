import { z } from "zod";

export const ChurchContextProjectionNameSchema = z.enum([
  "planning-setlist",
  "planning-readiness",
  "service-summary",
  "integration-status"
]);

export const ChurchContextProjectionRequestSchema = z.object({
  tenantId: z.string().min(1),
  projectionName: ChurchContextProjectionNameSchema,
  requestedByActorId: z.string().min(1)
});

export const ChurchContextProjectionEnvelopeSchema = z.object({
  schemaVersion: z.string().min(1),
  projectionName: ChurchContextProjectionNameSchema,
  generatedAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown())
});

export type ChurchContextProjectionName = z.infer<typeof ChurchContextProjectionNameSchema>;
export type ChurchContextProjectionRequest = z.infer<typeof ChurchContextProjectionRequestSchema>;
export type ChurchContextProjectionEnvelope = z.infer<typeof ChurchContextProjectionEnvelopeSchema>;

export interface ChurchContextBuilder {
  readonly buildProjection: (
    request: ChurchContextProjectionRequest
  ) => Promise<ChurchContextProjectionEnvelope>;
}
