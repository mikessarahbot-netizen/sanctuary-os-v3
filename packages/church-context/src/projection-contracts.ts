import { z } from "zod";

export const churchContextProjectionNames = [
  "planning-setlist",
  "planning-readiness",
  "service-summary",
  "integration-status"
] as const;

export const ChurchContextProjectionNameSchema = z.enum(churchContextProjectionNames);

export const ChurchContextProjectionMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  projectionName: ChurchContextProjectionNameSchema,
  schemaVersion: z.string().min(1),
  tenantId: z.string().min(1)
});

export type ChurchContextProjectionName = z.infer<typeof ChurchContextProjectionNameSchema>;
export type ChurchContextProjectionMetadata = z.infer<typeof ChurchContextProjectionMetadataSchema>;
