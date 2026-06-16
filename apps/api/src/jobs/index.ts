import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);

export const ApiJobTypeSchema = z.enum([
  "bulk-notifications",
  "attendance-forecast",
  "large-comms-draft",
  "ccli-reporting",
  "media-processing"
]);

export const ApiCcliReportingJobPayloadSchema = z
  .object({
    reportingStatus: z.literal("pending").default("pending"),
    serviceId: NonEmptyStringSchema
  })
  .strict();

export const ApiJobRequestSchema = z
  .object({
    jobType: ApiJobTypeSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
    requestedByActorId: NonEmptyStringSchema,
    requestId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict()
  .superRefine((request, context) => {
    if (request.jobType !== "ccli-reporting") {
      return;
    }

    const payloadResult = ApiCcliReportingJobPayloadSchema.safeParse(
      request.payload
    );

    if (!payloadResult.success) {
      for (const issue of payloadResult.error.issues) {
        context.addIssue({
          ...issue,
          path: ["payload", ...issue.path]
        });
      }
    }
  });

export const ApiJobEnqueueResultSchema = z
  .object({
    jobId: NonEmptyStringSchema
  })
  .strict();

export const ApiQueuedJobSchema = z
  .object({
    jobId: NonEmptyStringSchema,
    request: ApiJobRequestSchema,
    sequence: z.number().int().positive()
  })
  .strict();

export type ApiJobType = z.infer<typeof ApiJobTypeSchema>;
export type ApiJobRequest = z.infer<typeof ApiJobRequestSchema>;
export type ApiCcliReportingJobPayload = z.infer<
  typeof ApiCcliReportingJobPayloadSchema
>;
export type ApiJobEnqueueResult = z.infer<typeof ApiJobEnqueueResultSchema>;
export type ApiQueuedJob = z.infer<typeof ApiQueuedJobSchema>;

export interface JobDispatcher {
  readonly enqueue: (request: ApiJobRequest) => Promise<ApiJobEnqueueResult>;
}

export interface InMemoryJobDispatcher extends JobDispatcher {
  readonly readQueuedJobs: () => readonly ApiQueuedJob[];
  readonly clear: () => void;
}

export const validateApiJobRequest = (rawRequest: ApiJobRequest): ApiJobRequest =>
  ApiJobRequestSchema.parse(rawRequest);

export const createInMemoryJobDispatcher = (): InMemoryJobDispatcher => {
  const queuedJobs: ApiQueuedJob[] = [];

  return {
    clear: (): void => {
      queuedJobs.length = 0;
    },
    enqueue: (request: ApiJobRequest): Promise<ApiJobEnqueueResult> => {
      try {
        const validatedRequest = validateApiJobRequest(request);
        const result = ApiJobEnqueueResultSchema.parse({
          jobId: `job_${String(queuedJobs.length + 1)}`
        });

        queuedJobs.push(
          ApiQueuedJobSchema.parse({
            jobId: result.jobId,
            request: validatedRequest,
            sequence: queuedJobs.length + 1
          })
        );

        return Promise.resolve(result);
      } catch (error: unknown) {
        return Promise.reject(toJobDispatcherError(error));
      }
    },
    readQueuedJobs: (): readonly ApiQueuedJob[] => [...queuedJobs]
  };
};

const toJobDispatcherError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Invalid API job request.");
