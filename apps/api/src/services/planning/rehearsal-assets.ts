import { z } from "zod";
import type {
  PlanningPersistenceOperation,
  PlanningReadPersistenceOperation,
  PlanningRehearsalAssetVisibilityPersistenceRepository,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema, AuthenticatedActorSchema } from "../../auth/index.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PlanningRehearsalAssetVisibilityManageRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner"
]);

export const PlanningRehearsalAssetVisibilityReadRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
]);

export const PlanningRehearsalAssetTypeSchema = z.enum([
  "chart",
  "audio",
  "video",
  "document",
  "other"
]);

export const PlanningRehearsalAssetVisibilityRecordSchema = z
  .object({
    assetId: NonEmptyStringSchema,
    assetType: PlanningRehearsalAssetTypeSchema,
    isVisible: z.boolean(),
    rehearsalAssetVisibilityId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    updatedAt: z.string().datetime(),
    visibleToRoleIds: z.array(NonEmptyStringSchema).min(1)
  })
  .strict();

const PlanningRehearsalAssetVisibilityBaseSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

export const SetPlanningRehearsalAssetVisibilityCommandSchema =
  PlanningRehearsalAssetVisibilityBaseSchema.extend({
    input: z
      .object({
        assetId: NonEmptyStringSchema,
        assetType: PlanningRehearsalAssetTypeSchema,
        isVisible: z.boolean(),
        serviceId: NonEmptyStringSchema,
        serviceItemId: NonEmptyStringSchema,
        title: NonEmptyStringSchema,
        updatedAt: z.string().datetime(),
        visibleToRoleIds: z.array(NonEmptyStringSchema).min(1)
      })
      .strict()
  });

export const ListPlanningRehearsalAssetVisibilityQuerySchema =
  PlanningRehearsalAssetVisibilityBaseSchema.extend({
    input: z
      .object({
        serviceId: NonEmptyStringSchema,
        serviceItemId: OptionalNonEmptyStringSchema
      })
      .strict()
  });

export type PlanningRehearsalAssetVisibilityManageRole = z.infer<
  typeof PlanningRehearsalAssetVisibilityManageRoleSchema
>;
export type PlanningRehearsalAssetVisibilityReadRole = z.infer<
  typeof PlanningRehearsalAssetVisibilityReadRoleSchema
>;
export type PlanningRehearsalAssetType = z.infer<
  typeof PlanningRehearsalAssetTypeSchema
>;
export type PlanningRehearsalAssetVisibilityRecord = z.infer<
  typeof PlanningRehearsalAssetVisibilityRecordSchema
>;
export type SetPlanningRehearsalAssetVisibilityCommand = z.infer<
  typeof SetPlanningRehearsalAssetVisibilityCommandSchema
>;
export type ListPlanningRehearsalAssetVisibilityQuery = z.infer<
  typeof ListPlanningRehearsalAssetVisibilityQuerySchema
>;

export interface PlanningRehearsalAssetVisibilityRepository {
  readonly setRehearsalAssetVisibility: PlanningRehearsalAssetVisibilityPersistenceRepository["setRehearsalAssetVisibility"];
  readonly listRehearsalAssetVisibility: PlanningRehearsalAssetVisibilityPersistenceRepository["listRehearsalAssetVisibility"];
}

export interface PlanningRehearsalAssetVisibilityServiceDependencies {
  readonly planningRepository: PlanningRehearsalAssetVisibilityRepository;
}

export interface PlanningRehearsalAssetVisibilityService {
  readonly setAssetVisibility: (
    command: SetPlanningRehearsalAssetVisibilityCommand
  ) => Promise<PlanningRehearsalAssetVisibilityRecord>;
  readonly listAssetVisibility: (
    query: ListPlanningRehearsalAssetVisibilityQuery
  ) => Promise<readonly PlanningRehearsalAssetVisibilityRecord[]>;
}

export const createPlanningRehearsalAssetVisibilityService = (
  dependencies: PlanningRehearsalAssetVisibilityServiceDependencies
): PlanningRehearsalAssetVisibilityService => ({
  setAssetVisibility: async (
    rawCommand: SetPlanningRehearsalAssetVisibilityCommand
  ): Promise<PlanningRehearsalAssetVisibilityRecord> => {
    const command = SetPlanningRehearsalAssetVisibilityCommandSchema.parse(rawCommand);
    assertPlanningRehearsalAssetVisibilityManageRole(command.actor);

    const visibility = PlanningRehearsalAssetVisibilityRecordSchema.parse(
      await dependencies.planningRepository.setRehearsalAssetVisibility(
        toPlanningWriteOperation(command, "update")
      )
    );

    return assertTenantScopedRehearsalAssetVisibility(visibility, {
      expectedIsVisible: command.input.isVisible,
      expectedServiceId: command.input.serviceId,
      expectedServiceItemId: command.input.serviceItemId,
      expectedTenantId: command.actor.tenantId,
      expectedVisibleToRoleIds: command.input.visibleToRoleIds
    });
  },

  listAssetVisibility: async (
    rawQuery: ListPlanningRehearsalAssetVisibilityQuery
  ): Promise<readonly PlanningRehearsalAssetVisibilityRecord[]> => {
    const query = ListPlanningRehearsalAssetVisibilityQuerySchema.parse(rawQuery);
    assertPlanningRehearsalAssetVisibilityReadRole(query.actor);

    return z
      .array(PlanningRehearsalAssetVisibilityRecordSchema)
      .parse(
        await dependencies.planningRepository.listRehearsalAssetVisibility(
          toPlanningReadOperation(query)
        )
      )
      .map((visibility) =>
        assertTenantScopedRehearsalAssetVisibility(
          visibility,
          toRehearsalAssetVisibilityScope(
            query.actor.tenantId,
            query.input.serviceId,
            query.input.serviceItemId
          )
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

const assertPlanningRehearsalAssetVisibilityManageRole = (
  actor: AuthenticatedActor
): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningRehearsalAssetVisibilityManageRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error(
      "Actor is not allowed to manage Planning rehearsal asset visibility."
    );
  }
};

const assertPlanningRehearsalAssetVisibilityReadRole = (
  actor: AuthenticatedActor
): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningRehearsalAssetVisibilityReadRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error("Actor is not allowed to read Planning rehearsal assets.");
  }
};

const toRehearsalAssetVisibilityScope = (
  expectedTenantId: string,
  expectedServiceId: string,
  expectedServiceItemId?: string
): Readonly<{
  expectedServiceId: string;
  expectedServiceItemId?: string;
  expectedTenantId: string;
}> => ({
  expectedServiceId,
  ...(expectedServiceItemId === undefined ? {} : { expectedServiceItemId }),
  expectedTenantId
});

const assertTenantScopedRehearsalAssetVisibility = (
  rawVisibility: PlanningRehearsalAssetVisibilityRecord,
  scope: Readonly<{
    expectedServiceId: string;
    expectedServiceItemId?: string;
    expectedTenantId: string;
    expectedIsVisible?: boolean;
    expectedVisibleToRoleIds?: readonly string[];
  }>
): PlanningRehearsalAssetVisibilityRecord => {
  const visibility = PlanningRehearsalAssetVisibilityRecordSchema.parse(rawVisibility);

  if (visibility.tenantId !== scope.expectedTenantId) {
    throw new Error("Planning rehearsal asset visibility tenant mismatch.");
  }

  if (visibility.serviceId !== scope.expectedServiceId) {
    throw new Error("Planning rehearsal asset visibility service mismatch.");
  }

  if (
    scope.expectedServiceItemId !== undefined &&
    visibility.serviceItemId !== scope.expectedServiceItemId
  ) {
    throw new Error("Planning rehearsal asset visibility service item mismatch.");
  }

  if (
    scope.expectedIsVisible !== undefined &&
    visibility.isVisible !== scope.expectedIsVisible
  ) {
    throw new Error("Planning rehearsal asset visibility state mismatch.");
  }

  if (
    scope.expectedVisibleToRoleIds !== undefined &&
    !sameStringSet(visibility.visibleToRoleIds, scope.expectedVisibleToRoleIds)
  ) {
    throw new Error("Planning rehearsal asset visibility role scope mismatch.");
  }

  return visibility;
};

const sameStringSet = (
  actual: readonly string[],
  expected: readonly string[]
): boolean =>
  actual.length === expected.length &&
  actual.every((value) => expected.includes(value));
