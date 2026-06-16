import { z } from "zod";

export const DatabaseOperationContextSchema = z.object({
  actorId: z.string().min(1).optional(),
  requestId: z.string().min(1),
  tenantId: z.string().min(1)
});

export type DatabaseOperationContext = z.infer<typeof DatabaseOperationContextSchema>;
