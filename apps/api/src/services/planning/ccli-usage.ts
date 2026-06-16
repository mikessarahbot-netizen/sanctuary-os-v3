import { z } from "zod";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema, AuthenticatedActorSchema } from "../../auth/index.js";
import type {
  PlanningCcliUsageLogPersistenceRepository,
  PlanningPersistenceOperation,
  PlanningReadPersistenceOperation,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import type {
  ApiJobStatusRecord,
  JobDispatcher,
  JobStatusReader
} from "../../jobs/index.js";
import {
  ApiJobEnqueueResultSchema,
  ApiJobStatusRecordSchema
} from "../../jobs/index.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PlanningCcliUsageRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner"
]);

export const PlanningCcliUsageTypeSchema = z.enum([
  "service",
  "rehearsal",
  "livestream"
]);

export const PlanningCcliUsageReportingStatusSchema = z.enum([
  "pending",
  "reported",
  "skipped"
]);

export const PlanningCcliUsageLogRecordSchema = z.object({
  ccliSongNumber: OptionalNonEmptyStringSchema,
  ccliUsageLogId: NonEmptyStringSchema,
  notes: OptionalNonEmptyStringSchema,
  reportingStatus: PlanningCcliUsageReportingStatusSchema,
  serviceId: NonEmptyStringSchema,
  serviceItemId: OptionalNonEmptyStringSchema,
  songId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  usageType: PlanningCcliUsageTypeSchema,
  usedAt: z.string().datetime()
});

const PlanningCcliUsageBaseSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

export const RecordPlanningCcliUsageCommandSchema = PlanningCcliUsageBaseSchema.extend({
  input: z
    .object({
      ccliSongNumber: OptionalNonEmptyStringSchema,
      notes: OptionalNonEmptyStringSchema,
      serviceId: NonEmptyStringSchema,
      serviceItemId: OptionalNonEmptyStringSchema,
      songId: NonEmptyStringSchema,
      title: NonEmptyStringSchema,
      usageType: PlanningCcliUsageTypeSchema,
      usedAt: z.string().datetime()
    })
    .strict()
});

export const ListPlanningCcliUsageLogsQuerySchema = PlanningCcliUsageBaseSchema.extend({
  input: z
    .object({
      reportingStatus: PlanningCcliUsageReportingStatusSchema.optional(),
      serviceId: NonEmptyStringSchema
    })
    .strict()
});

export const SchedulePlanningCcliReportingJobCommandSchema =
  PlanningCcliUsageBaseSchema.extend({
    input: z
      .object({
        reportingStatus: z.literal("pending").default("pending"),
        serviceId: NonEmptyStringSchema
      })
      .strict()
  });

export const GetPlanningCcliReportingJobStatusQuerySchema =
  PlanningCcliUsageBaseSchema.extend({
    input: z
      .object({
        jobId: NonEmptyStringSchema
      })
      .strict()
  });

export type PlanningCcliUsageRole = z.infer<typeof PlanningCcliUsageRoleSchema>;
export type PlanningCcliUsageType = z.infer<typeof PlanningCcliUsageTypeSchema>;
export type PlanningCcliUsageReportingStatus = z.infer<
  typeof PlanningCcliUsageReportingStatusSchema
>;
export type PlanningCcliUsageLogRecord = z.infer<
  typeof PlanningCcliUsageLogRecordSchema
>;
export type RecordPlanningCcliUsageCommand = z.infer<
  typeof RecordPlanningCcliUsageCommandSchema
>;
export type ListPlanningCcliUsageLogsQuery = z.infer<
  typeof ListPlanningCcliUsageLogsQuerySchema
>;
export type SchedulePlanningCcliReportingJobCommand = z.infer<
  typeof SchedulePlanningCcliReportingJobCommandSchema
>;
export type GetPlanningCcliReportingJobStatusQuery = z.infer<
  typeof GetPlanningCcliReportingJobStatusQuerySchema
>;

export interface PlanningCcliUsageRepository {
  readonly recordCcliUsage: PlanningCcliUsageLogPersistenceRepository["recordCcliUsage"];
  readonly listCcliUsageLogs: PlanningCcliUsageLogPersistenceRepository["listCcliUsageLogs"];
}

export interface PlanningCcliUsageServiceDependencies {
  readonly jobDispatcher?: JobDispatcher;
  readonly jobStatusReader?: JobStatusReader;
  readonly planningRepository: PlanningCcliUsageRepository;
}

export interface PlanningCcliUsageService {
  readonly recordUsage: (
    command: RecordPlanningCcliUsageCommand
  ) => Promise<PlanningCcliUsageLogRecord>;
  readonly listUsageLogs: (
    query: ListPlanningCcliUsageLogsQuery
  ) => Promise<readonly PlanningCcliUsageLogRecord[]>;
  readonly scheduleReportingJob: (
    command: SchedulePlanningCcliReportingJobCommand
  ) => Promise<{ readonly jobId: string }>;
  readonly getReportingJobStatus: (
    query: GetPlanningCcliReportingJobStatusQuery
  ) => Promise<ApiJobStatusRecord | null>;
}

export const createPlanningCcliUsageService = (
  dependencies: PlanningCcliUsageServiceDependencies
): PlanningCcliUsageService => ({
  recordUsage: async (
    rawCommand: RecordPlanningCcliUsageCommand
  ): Promise<PlanningCcliUsageLogRecord> => {
    const command = RecordPlanningCcliUsageCommandSchema.parse(rawCommand);
    assertPlanningCcliUsageRole(command.actor);

    const usageLog = PlanningCcliUsageLogRecordSchema.parse(
      await dependencies.planningRepository.recordCcliUsage(
        toPlanningWriteOperation(command, "create")
      )
    );

    return assertTenantScopedCcliUsageLog(
      usageLog,
      command.actor.tenantId,
      command.input.serviceId
    );
  },

  listUsageLogs: async (
    rawQuery: ListPlanningCcliUsageLogsQuery
  ): Promise<readonly PlanningCcliUsageLogRecord[]> => {
    const query = ListPlanningCcliUsageLogsQuerySchema.parse(rawQuery);
    assertPlanningCcliUsageRole(query.actor);

    return z
      .array(PlanningCcliUsageLogRecordSchema)
      .parse(
        await dependencies.planningRepository.listCcliUsageLogs(
          toPlanningReadOperation(query)
        )
      )
      .map((usageLog) =>
        assertTenantScopedCcliUsageLog(
          usageLog,
          query.actor.tenantId,
          query.input.serviceId,
          query.input.reportingStatus
        )
      );
  },

  scheduleReportingJob: async (
    rawCommand: SchedulePlanningCcliReportingJobCommand
  ): Promise<{ readonly jobId: string }> => {
    const command = SchedulePlanningCcliReportingJobCommandSchema.parse(rawCommand);
    assertPlanningCcliUsageRole(command.actor);

    const jobDispatcher = dependencies.jobDispatcher;

    if (jobDispatcher === undefined) {
      throw new Error("Planning CCLI reporting job dispatcher is not configured.");
    }

    return ApiJobEnqueueResultSchema.parse(
      await jobDispatcher.enqueue({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: command.input.reportingStatus,
          serviceId: command.input.serviceId
        },
        requestedByActorId: command.actor.actorId,
        requestId: command.requestId,
        tenantId: command.actor.tenantId
      })
    );
  },

  getReportingJobStatus: async (
    rawQuery: GetPlanningCcliReportingJobStatusQuery
  ): Promise<ApiJobStatusRecord | null> => {
    const query = GetPlanningCcliReportingJobStatusQuerySchema.parse(rawQuery);
    assertPlanningCcliUsageRole(query.actor);

    const jobStatusReader = dependencies.jobStatusReader;

    if (jobStatusReader === undefined) {
      throw new Error("Planning CCLI reporting job status reader is not configured.");
    }

    const jobStatus = await jobStatusReader.getJobStatus({
      jobId: query.input.jobId,
      requestedByActorId: query.actor.actorId,
      requestId: query.requestId,
      tenantId: query.actor.tenantId
    });

    if (jobStatus === null) {
      return null;
    }

    return assertTenantScopedCcliReportingJobStatus(
      jobStatus,
      query.actor.tenantId,
      query.input.jobId
    );
  }
});

const toPlanningWriteOperation = <TInput>(
  command: Readonly<{
    actor: AuthenticatedActor;
    input: TInput;
    requestId: string;
  }>,
  intent: RepositoryMutationIntent
): PlanningPersistenceOperation<TInput> => ({
  input: command.input,
  options: {
    context: {
      actorId: command.actor.actorId,
      requestId: command.requestId,
      tenantId: command.actor.tenantId
    },
    intent
  }
});

const toPlanningReadOperation = <TInput>(
  query: Readonly<{
    actor: AuthenticatedActor;
    input: TInput;
    requestId: string;
  }>
): PlanningReadPersistenceOperation<TInput> => ({
  input: query.input,
  options: {
    context: {
      actorId: query.actor.actorId,
      requestId: query.requestId,
      tenantId: query.actor.tenantId
    }
  }
});

const assertPlanningCcliUsageRole = (actor: AuthenticatedActor): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningCcliUsageRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error("Actor is not allowed to manage Planning CCLI usage logs.");
  }
};

const assertTenantScopedCcliUsageLog = (
  rawUsageLog: PlanningCcliUsageLogRecord,
  expectedTenantId: string,
  expectedServiceId: string,
  expectedReportingStatus?: PlanningCcliUsageReportingStatus
): PlanningCcliUsageLogRecord => {
  const usageLog = PlanningCcliUsageLogRecordSchema.parse(rawUsageLog);

  if (usageLog.tenantId !== expectedTenantId) {
    throw new Error("Planning CCLI usage log tenant mismatch.");
  }

  if (usageLog.serviceId !== expectedServiceId) {
    throw new Error("Planning CCLI usage log service mismatch.");
  }

  if (
    expectedReportingStatus !== undefined &&
    usageLog.reportingStatus !== expectedReportingStatus
  ) {
    throw new Error("Planning CCLI usage log reporting status mismatch.");
  }

  return usageLog;
};

const assertTenantScopedCcliReportingJobStatus = (
  rawJobStatus: ApiJobStatusRecord,
  expectedTenantId: string,
  expectedJobId: string
): ApiJobStatusRecord => {
  const jobStatus = ApiJobStatusRecordSchema.parse(rawJobStatus);

  if (jobStatus.tenantId !== expectedTenantId) {
    throw new Error("Planning CCLI reporting job status tenant mismatch.");
  }

  if (jobStatus.jobId !== expectedJobId) {
    throw new Error("Planning CCLI reporting job status id mismatch.");
  }

  if (jobStatus.jobType !== "ccli-reporting") {
    throw new Error("Planning CCLI reporting job status type mismatch.");
  }

  return jobStatus;
};
