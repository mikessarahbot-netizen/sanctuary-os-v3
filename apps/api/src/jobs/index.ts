import { z } from "zod";

export const ApiJobTypeSchema = z.enum([
  "bulk-notifications",
  "attendance-forecast",
  "large-comms-draft",
  "ccli-reporting",
  "media-processing"
]);

export const ApiJobRequestSchema = z.object({
  jobType: ApiJobTypeSchema,
  requestedByActorId: z.string().min(1),
  tenantId: z.string().min(1)
});

export type ApiJobType = z.infer<typeof ApiJobTypeSchema>;
export type ApiJobRequest = z.infer<typeof ApiJobRequestSchema>;

export interface JobDispatcher {
  readonly enqueue: (request: ApiJobRequest) => Promise<{ readonly jobId: string }>;
}
