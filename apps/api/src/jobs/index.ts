import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);
const SafeErrorMessageSchema = NonEmptyStringSchema.max(240);

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

export const ApiJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed"
]);

export const ApiQueuedJobSchema = z
  .object({
    jobId: NonEmptyStringSchema,
    request: ApiJobRequestSchema,
    sequence: z.number().int().positive()
  })
  .strict();

export const ApiJobStatusRecordSchema = z
  .object({
    enqueuedAt: z.string().datetime(),
    jobId: NonEmptyStringSchema,
    jobType: ApiJobTypeSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
    requestedByActorId: NonEmptyStringSchema,
    requestId: NonEmptyStringSchema,
    safeErrorMessage: SafeErrorMessageSchema.optional(),
    sequence: z.number().int().positive(),
    status: ApiJobStatusSchema,
    tenantId: NonEmptyStringSchema,
    updatedAt: z.string().datetime()
  })
  .strict()
  .superRefine((record, context) => {
    if (record.status === "failed" && record.safeErrorMessage === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Failed API jobs require a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (record.status !== "failed" && record.safeErrorMessage !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only failed API jobs can include a safe error message.",
        path: ["safeErrorMessage"]
      });
    }

    if (record.jobType !== "ccli-reporting") {
      return;
    }

    const payloadResult = ApiCcliReportingJobPayloadSchema.safeParse(
      record.payload
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

export const ApiJobStatusLookupSchema = z
  .object({
    jobId: NonEmptyStringSchema,
    requestedByActorId: NonEmptyStringSchema,
    requestId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

export type ApiJobType = z.infer<typeof ApiJobTypeSchema>;
export type ApiJobRequest = z.infer<typeof ApiJobRequestSchema>;
export type ApiCcliReportingJobPayload = z.infer<
  typeof ApiCcliReportingJobPayloadSchema
>;
export type ApiJobEnqueueResult = z.infer<typeof ApiJobEnqueueResultSchema>;
export type ApiJobStatus = z.infer<typeof ApiJobStatusSchema>;
export type ApiQueuedJob = z.infer<typeof ApiQueuedJobSchema>;
export type ApiJobStatusRecord = z.infer<typeof ApiJobStatusRecordSchema>;
export type ApiJobStatusLookup = z.infer<typeof ApiJobStatusLookupSchema>;

export interface JobDispatcher {
  readonly enqueue: (request: ApiJobRequest) => Promise<ApiJobEnqueueResult>;
}

export interface JobStatusReader {
  readonly getJobStatus: (
    lookup: ApiJobStatusLookup
  ) => Promise<ApiJobStatusRecord | null>;
}

export interface InMemoryJobDispatcher extends JobDispatcher {
  readonly readQueuedJobs: () => readonly ApiQueuedJob[];
  readonly readJobStatuses: () => readonly ApiJobStatusRecord[];
  readonly getJobStatus: (
    lookup: ApiJobStatusLookup
  ) => Promise<ApiJobStatusRecord | null>;
  readonly clear: () => void;
}

export const validateApiJobRequest = (rawRequest: ApiJobRequest): ApiJobRequest =>
  ApiJobRequestSchema.parse(rawRequest);

export const validateApiJobStatusRecord = (
  rawStatusRecord: ApiJobStatusRecord
): ApiJobStatusRecord => ApiJobStatusRecordSchema.parse(rawStatusRecord);

export const createInMemoryJobDispatcher = (): InMemoryJobDispatcher => {
  const queuedJobs: ApiQueuedJob[] = [];
  const jobStatuses: ApiJobStatusRecord[] = [];

  return {
    clear: (): void => {
      queuedJobs.length = 0;
      jobStatuses.length = 0;
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
        const queuedJob = queuedJobs[queuedJobs.length - 1];

        if (queuedJob === undefined) {
          throw new Error("API job dispatcher failed to record queued job.");
        }

        const now = new Date().toISOString();

        jobStatuses.push(
          ApiJobStatusRecordSchema.parse({
            enqueuedAt: now,
            jobId: queuedJob.jobId,
            jobType: queuedJob.request.jobType,
            payload: queuedJob.request.payload,
            requestedByActorId: queuedJob.request.requestedByActorId,
            requestId: queuedJob.request.requestId,
            sequence: queuedJob.sequence,
            status: "queued",
            tenantId: queuedJob.request.tenantId,
            updatedAt: now
          })
        );

        return Promise.resolve(result);
      } catch (error: unknown) {
        return Promise.reject(toJobDispatcherError(error));
      }
    },
    getJobStatus: (lookup: ApiJobStatusLookup): Promise<ApiJobStatusRecord | null> => {
      try {
        const parsedLookup = ApiJobStatusLookupSchema.parse(lookup);
        const jobStatus = jobStatuses.find(
          (status) =>
            status.jobId === parsedLookup.jobId &&
            status.tenantId === parsedLookup.tenantId
        );

        if (jobStatus === undefined) {
          return Promise.resolve(null);
        }

        return Promise.resolve(ApiJobStatusRecordSchema.parse(jobStatus));
      } catch (error: unknown) {
        return Promise.reject(toJobDispatcherError(error));
      }
    },
    readJobStatuses: (): readonly ApiJobStatusRecord[] => [...jobStatuses],
    readQueuedJobs: (): readonly ApiQueuedJob[] => [...queuedJobs]
  };
};

const toJobDispatcherError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Invalid API job request.");
