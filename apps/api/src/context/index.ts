import {
  ChurchContextProjectionNameSchema,
  type PlanningSetlistChurchContextProjection,
  PlanningSetlistChurchContextProjectionSchema
} from "@sanctuary-os/church-context";
import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);

export const ChurchContextProjectionRequestSchema = z.object({
  tenantId: NonEmptyStringSchema,
  projectionName: ChurchContextProjectionNameSchema,
  requestedByActorId: NonEmptyStringSchema
});

export const ChurchContextProjectionEnvelopeSchema = z.object({
  generatedAt: z.string().datetime(),
  projectionName: ChurchContextProjectionNameSchema,
  payload: z.record(z.string(), z.unknown()),
  schemaVersion: NonEmptyStringSchema
});

export const PlanningSetlistChurchContextProjectionRequestSchema =
  ChurchContextProjectionRequestSchema.extend({
    projectionName: z.literal("planning-setlist"),
    requestId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema
  }).strict();

export const PlanningSetlistChurchContextProjectionEnvelopeSchema = z
  .object({
    generatedAt: z.string().datetime(),
    payload: PlanningSetlistChurchContextProjectionSchema,
    projectionName: z.literal("planning-setlist"),
    requestId: NonEmptyStringSchema,
    requestedByActorId: NonEmptyStringSchema,
    schemaVersion: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.payload.contextMetadata.tenantId !== envelope.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection envelope tenant mismatch.",
        path: ["payload", "contextMetadata", "tenantId"]
      });
    }

    if (envelope.payload.contextMetadata.generatedAt !== envelope.generatedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection envelope timestamp mismatch.",
        path: ["payload", "contextMetadata", "generatedAt"]
      });
    }

    if (envelope.payload.contextMetadata.schemaVersion !== envelope.schemaVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection envelope schema version mismatch.",
        path: ["payload", "contextMetadata", "schemaVersion"]
      });
    }

    if (envelope.payload.service.serviceId !== envelope.serviceId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Planning setlist projection envelope service mismatch.",
        path: ["payload", "service", "serviceId"]
      });
    }
  });

export const PlanningSetlistChurchContextProjectionInputSchema = z
  .object({
    payload: PlanningSetlistChurchContextProjectionSchema,
    request: PlanningSetlistChurchContextProjectionRequestSchema
  })
  .strict();

export type ChurchContextProjectionName = z.infer<typeof ChurchContextProjectionNameSchema>;
export type ChurchContextProjectionRequest = z.infer<typeof ChurchContextProjectionRequestSchema>;
export type ChurchContextProjectionEnvelope = z.infer<typeof ChurchContextProjectionEnvelopeSchema>;
export type PlanningSetlistChurchContextProjectionRequest = z.infer<
  typeof PlanningSetlistChurchContextProjectionRequestSchema
>;
export type PlanningSetlistChurchContextProjectionEnvelope = z.infer<
  typeof PlanningSetlistChurchContextProjectionEnvelopeSchema
>;
export type PlanningSetlistChurchContextProjectionInput = z.infer<
  typeof PlanningSetlistChurchContextProjectionInputSchema
>;

export const buildPlanningSetlistChurchContextProjectionEnvelope = (
  input: PlanningSetlistChurchContextProjectionInput
): PlanningSetlistChurchContextProjectionEnvelope => {
  const parsedInput = PlanningSetlistChurchContextProjectionInputSchema.parse(input);
  const payload: PlanningSetlistChurchContextProjection =
    PlanningSetlistChurchContextProjectionSchema.parse(parsedInput.payload);

  return PlanningSetlistChurchContextProjectionEnvelopeSchema.parse({
    generatedAt: payload.contextMetadata.generatedAt,
    payload,
    projectionName: "planning-setlist",
    requestId: parsedInput.request.requestId,
    requestedByActorId: parsedInput.request.requestedByActorId,
    schemaVersion: payload.contextMetadata.schemaVersion,
    serviceId: parsedInput.request.serviceId,
    tenantId: parsedInput.request.tenantId
  });
};

export interface ChurchContextBuilder {
  readonly buildProjection: (
    request: ChurchContextProjectionRequest
  ) => Promise<ChurchContextProjectionEnvelope>;
  readonly buildPlanningSetlistProjection: (
    request: PlanningSetlistChurchContextProjectionRequest
  ) => Promise<PlanningSetlistChurchContextProjectionEnvelope>;
}
