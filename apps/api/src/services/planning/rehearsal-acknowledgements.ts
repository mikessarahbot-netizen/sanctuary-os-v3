import { z } from "zod";
import type {
  PlanningPersistenceOperation,
  PlanningReadPersistenceOperation,
  PlanningRehearsalAcknowledgementPersistenceRepository,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema, AuthenticatedActorSchema } from "../../auth/index.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PlanningRehearsalAcknowledgementWriteRoleSchema =
  ApiRoleSchema.extract([
    "church_admin",
    "worship_leader",
    "planner",
    "musician",
    "volunteer"
  ]);

export const PlanningRehearsalAcknowledgementReadRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
]);

export const PlanningRehearsalReadinessSignalSchema = z.enum([
  "ready",
  "needs-practice",
  "blocked"
]);

export const PlanningRehearsalAcknowledgementRecordSchema = z
  .object({
    acknowledgedAt: z.string().datetime(),
    assetId: NonEmptyStringSchema,
    assignmentId: NonEmptyStringSchema,
    notes: OptionalNonEmptyStringSchema,
    personId: NonEmptyStringSchema,
    readinessSignal: PlanningRehearsalReadinessSignalSchema,
    rehearsalAcknowledgementId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  })
  .strict();

const PlanningRehearsalAcknowledgementBaseSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

export const RecordPlanningRehearsalAcknowledgementCommandSchema =
  PlanningRehearsalAcknowledgementBaseSchema.extend({
    input: z
      .object({
        acknowledgedAt: z.string().datetime(),
        assetId: NonEmptyStringSchema,
        assignmentId: NonEmptyStringSchema,
        notes: OptionalNonEmptyStringSchema,
        personId: NonEmptyStringSchema,
        readinessSignal: PlanningRehearsalReadinessSignalSchema,
        serviceId: NonEmptyStringSchema,
        serviceItemId: NonEmptyStringSchema
      })
      .strict()
  });

export const ListPlanningRehearsalAcknowledgementsQuerySchema =
  PlanningRehearsalAcknowledgementBaseSchema.extend({
    input: z
      .object({
        assetId: OptionalNonEmptyStringSchema,
        assignmentId: OptionalNonEmptyStringSchema,
        personId: OptionalNonEmptyStringSchema,
        serviceId: NonEmptyStringSchema,
        serviceItemId: OptionalNonEmptyStringSchema
      })
      .strict()
  });

export type PlanningRehearsalAcknowledgementWriteRole = z.infer<
  typeof PlanningRehearsalAcknowledgementWriteRoleSchema
>;
export type PlanningRehearsalAcknowledgementReadRole = z.infer<
  typeof PlanningRehearsalAcknowledgementReadRoleSchema
>;
export type PlanningRehearsalReadinessSignal = z.infer<
  typeof PlanningRehearsalReadinessSignalSchema
>;
export type PlanningRehearsalAcknowledgementRecord = z.infer<
  typeof PlanningRehearsalAcknowledgementRecordSchema
>;
export type RecordPlanningRehearsalAcknowledgementCommand = z.infer<
  typeof RecordPlanningRehearsalAcknowledgementCommandSchema
>;
export type ListPlanningRehearsalAcknowledgementsQuery = z.infer<
  typeof ListPlanningRehearsalAcknowledgementsQuerySchema
>;

export interface PlanningRehearsalAcknowledgementRepository {
  readonly recordRehearsalAcknowledgement: PlanningRehearsalAcknowledgementPersistenceRepository["recordRehearsalAcknowledgement"];
  readonly listRehearsalAcknowledgements: PlanningRehearsalAcknowledgementPersistenceRepository["listRehearsalAcknowledgements"];
}

export interface PlanningRehearsalAcknowledgementServiceDependencies {
  readonly planningRepository: PlanningRehearsalAcknowledgementRepository;
}

export interface PlanningRehearsalAcknowledgementService {
  readonly recordAcknowledgement: (
    command: RecordPlanningRehearsalAcknowledgementCommand
  ) => Promise<PlanningRehearsalAcknowledgementRecord>;
  readonly listAcknowledgements: (
    query: ListPlanningRehearsalAcknowledgementsQuery
  ) => Promise<readonly PlanningRehearsalAcknowledgementRecord[]>;
}

export const createPlanningRehearsalAcknowledgementService = (
  dependencies: PlanningRehearsalAcknowledgementServiceDependencies
): PlanningRehearsalAcknowledgementService => ({
  recordAcknowledgement: async (
    rawCommand: RecordPlanningRehearsalAcknowledgementCommand
  ): Promise<PlanningRehearsalAcknowledgementRecord> => {
    const command =
      RecordPlanningRehearsalAcknowledgementCommandSchema.parse(rawCommand);
    assertPlanningRehearsalAcknowledgementWriteRole(command.actor);

    const acknowledgement = PlanningRehearsalAcknowledgementRecordSchema.parse(
      await dependencies.planningRepository.recordRehearsalAcknowledgement(
        toPlanningWriteOperation(command, "create")
      )
    );

    return assertTenantScopedRehearsalAcknowledgement(acknowledgement, {
      expectedAssetId: command.input.assetId,
      expectedAssignmentId: command.input.assignmentId,
      expectedPersonId: command.input.personId,
      expectedReadinessSignal: command.input.readinessSignal,
      expectedServiceId: command.input.serviceId,
      expectedServiceItemId: command.input.serviceItemId,
      expectedTenantId: command.actor.tenantId
    });
  },

  listAcknowledgements: async (
    rawQuery: ListPlanningRehearsalAcknowledgementsQuery
  ): Promise<readonly PlanningRehearsalAcknowledgementRecord[]> => {
    const query = ListPlanningRehearsalAcknowledgementsQuerySchema.parse(rawQuery);
    assertPlanningRehearsalAcknowledgementReadRole(query.actor);

    return z
      .array(PlanningRehearsalAcknowledgementRecordSchema)
      .parse(
        await dependencies.planningRepository.listRehearsalAcknowledgements(
          toPlanningReadOperation(query)
        )
      )
      .map((acknowledgement) =>
        assertTenantScopedRehearsalAcknowledgement(
          acknowledgement,
          toRehearsalAcknowledgementScope(query.actor.tenantId, query.input)
        )
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

const assertPlanningRehearsalAcknowledgementWriteRole = (
  actor: AuthenticatedActor
): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningRehearsalAcknowledgementWriteRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error(
      "Actor is not allowed to record Planning rehearsal acknowledgements."
    );
  }
};

const assertPlanningRehearsalAcknowledgementReadRole = (
  actor: AuthenticatedActor
): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningRehearsalAcknowledgementReadRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error("Actor is not allowed to read Planning rehearsal acknowledgements.");
  }
};

const toRehearsalAcknowledgementScope = (
  expectedTenantId: string,
  input: ListPlanningRehearsalAcknowledgementsQuery["input"]
): RehearsalAcknowledgementScope => ({
  ...(input.assetId === undefined ? {} : { expectedAssetId: input.assetId }),
  ...(input.assignmentId === undefined
    ? {}
    : { expectedAssignmentId: input.assignmentId }),
  ...(input.personId === undefined ? {} : { expectedPersonId: input.personId }),
  expectedServiceId: input.serviceId,
  ...(input.serviceItemId === undefined
    ? {}
    : { expectedServiceItemId: input.serviceItemId }),
  expectedTenantId
});

interface RehearsalAcknowledgementScope {
  readonly expectedAssetId?: string;
  readonly expectedAssignmentId?: string;
  readonly expectedPersonId?: string;
  readonly expectedReadinessSignal?: PlanningRehearsalReadinessSignal;
  readonly expectedServiceId: string;
  readonly expectedServiceItemId?: string;
  readonly expectedTenantId: string;
}

const assertTenantScopedRehearsalAcknowledgement = (
  rawAcknowledgement: PlanningRehearsalAcknowledgementRecord,
  scope: RehearsalAcknowledgementScope
): PlanningRehearsalAcknowledgementRecord => {
  const acknowledgement =
    PlanningRehearsalAcknowledgementRecordSchema.parse(rawAcknowledgement);

  if (acknowledgement.tenantId !== scope.expectedTenantId) {
    throw new Error("Planning rehearsal acknowledgement tenant mismatch.");
  }

  if (acknowledgement.serviceId !== scope.expectedServiceId) {
    throw new Error("Planning rehearsal acknowledgement service mismatch.");
  }

  if (
    scope.expectedServiceItemId !== undefined &&
    acknowledgement.serviceItemId !== scope.expectedServiceItemId
  ) {
    throw new Error("Planning rehearsal acknowledgement service item mismatch.");
  }

  if (
    scope.expectedAssetId !== undefined &&
    acknowledgement.assetId !== scope.expectedAssetId
  ) {
    throw new Error("Planning rehearsal acknowledgement asset mismatch.");
  }

  if (
    scope.expectedAssignmentId !== undefined &&
    acknowledgement.assignmentId !== scope.expectedAssignmentId
  ) {
    throw new Error("Planning rehearsal acknowledgement assignment mismatch.");
  }

  if (
    scope.expectedPersonId !== undefined &&
    acknowledgement.personId !== scope.expectedPersonId
  ) {
    throw new Error("Planning rehearsal acknowledgement person mismatch.");
  }

  if (
    scope.expectedReadinessSignal !== undefined &&
    acknowledgement.readinessSignal !== scope.expectedReadinessSignal
  ) {
    throw new Error("Planning rehearsal acknowledgement readiness signal mismatch.");
  }

  return acknowledgement;
};
