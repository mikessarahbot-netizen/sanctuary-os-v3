import { z } from "zod";
import type {
  PlanningReadPersistenceOperation,
  PlanningServiceQueryPersistenceRepository
} from "@sanctuary-os/db";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema, AuthenticatedActorSchema } from "../../auth/index.js";
import { PlanningReadinessResultSchema, type PlanningReadinessResult } from "../../domain/index.js";
import {
  PlanningAssignmentRecordSchema,
  PlanningServiceRecordSchema,
  PlanningServiceStatusSchema,
  type PlanningAssignmentRecord,
  type PlanningServiceRecord
} from "./commands.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PlanningServiceQueryRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner",
  "musician",
  "volunteer",
  "viewer"
]);

export const PlanningServicesFilterSchema = z.object({
  serviceTypeId: OptionalNonEmptyStringSchema,
  startsAtOrAfter: z.string().datetime().optional(),
  startsBefore: z.string().datetime().optional(),
  status: PlanningServiceStatusSchema.optional()
}).superRefine((filter, context) => {
  if (
    filter.startsAtOrAfter !== undefined &&
    filter.startsBefore !== undefined &&
    filter.startsAtOrAfter > filter.startsBefore
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Service filter startsAtOrAfter must be before startsBefore.",
      path: ["startsAtOrAfter"]
    });
  }
});

const PlanningQueryBaseSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

export const PlanningSongEnergySchema = z.enum(["low", "medium", "high"]);

export const ListPlanningServicesQuerySchema = PlanningQueryBaseSchema.extend({
  input: z.object({
    filter: PlanningServicesFilterSchema.optional()
  })
});

export const GetPlanningServiceQuerySchema = PlanningQueryBaseSchema.extend({
  input: z.object({
    serviceId: NonEmptyStringSchema
  })
});

export const PlanningServiceTemplateRecordSchema = z.object({
  description: OptionalNonEmptyStringSchema,
  serviceTemplateId: NonEmptyStringSchema,
  serviceTypeId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningSongLibraryItemRecordSchema = z.object({
  artist: OptionalNonEmptyStringSchema,
  availableKeys: z.array(NonEmptyStringSchema),
  ccliReportingAllowed: z.boolean(),
  ccliSongNumber: OptionalNonEmptyStringSchema,
  defaultKey: OptionalNonEmptyStringSchema,
  energy: PlanningSongEnergySchema.optional(),
  hasArrangements: z.boolean(),
  hasCharts: z.boolean(),
  isBannedOrPaused: z.boolean(),
  lastUsedAt: z.string().datetime().optional(),
  songId: NonEmptyStringSchema,
  tenantId: NonEmptyStringSchema,
  tempoBpm: z.number().int().positive().optional(),
  title: NonEmptyStringSchema,
  usageCount: z.number().int().nonnegative()
});

export const PlanningSongLibrarySearchInputSchema = z
  .object({
    includeBannedOrPaused: z.boolean().optional(),
    key: OptionalNonEmptyStringSchema,
    limit: z.number().int().min(1).max(50).optional(),
    query: OptionalNonEmptyStringSchema,
    serviceTypeId: OptionalNonEmptyStringSchema
  })
  .superRefine((input, context) => {
    if (
      input.query === undefined &&
      input.serviceTypeId === undefined &&
      input.key === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Song library search requires query, serviceTypeId, or key.",
        path: ["query"]
      });
    }
  });

export const ListPlanningServiceAssignmentsQuerySchema = GetPlanningServiceQuerySchema;
export const ListPlanningServiceTemplatesQuerySchema = PlanningQueryBaseSchema.extend({
  input: z.object({
    serviceTypeId: NonEmptyStringSchema
  })
});
export const ListPlanningSongLibraryQuerySchema = PlanningQueryBaseSchema.extend({
  input: z.object({
    searchInput: PlanningSongLibrarySearchInputSchema
  })
});
export const GetPlanningServiceReadinessQuerySchema = GetPlanningServiceQuerySchema;

export type PlanningServiceQueryRole = z.infer<typeof PlanningServiceQueryRoleSchema>;
export type PlanningServicesFilter = z.infer<typeof PlanningServicesFilterSchema>;
export type ListPlanningServicesQuery = z.infer<typeof ListPlanningServicesQuerySchema>;
export type GetPlanningServiceQuery = z.infer<typeof GetPlanningServiceQuerySchema>;
export type ListPlanningServiceAssignmentsQuery = z.infer<
  typeof ListPlanningServiceAssignmentsQuerySchema
>;
export type ListPlanningServiceTemplatesQuery = z.infer<
  typeof ListPlanningServiceTemplatesQuerySchema
>;
export type ListPlanningSongLibraryQuery = z.infer<
  typeof ListPlanningSongLibraryQuerySchema
>;
export type GetPlanningServiceReadinessQuery = z.infer<
  typeof GetPlanningServiceReadinessQuerySchema
>;
export type PlanningServiceTemplateRecord = z.infer<
  typeof PlanningServiceTemplateRecordSchema
>;
export type PlanningSongLibraryItemRecord = z.infer<
  typeof PlanningSongLibraryItemRecordSchema
>;

export interface PlanningQueryRepository {
  readonly listServices: PlanningServiceQueryPersistenceRepository["listServices"];
  readonly getService: PlanningServiceQueryPersistenceRepository["getService"];
  readonly listServiceAssignments: PlanningServiceQueryPersistenceRepository["listServiceAssignments"];
  readonly listServiceTemplates: PlanningServiceQueryPersistenceRepository["listServiceTemplates"];
  readonly listSongLibrary: PlanningServiceQueryPersistenceRepository["listSongLibrary"];
  readonly getServiceReadiness: PlanningServiceQueryPersistenceRepository["getServiceReadiness"];
}

export interface PlanningQueryServiceDependencies {
  readonly planningRepository: PlanningQueryRepository;
}

export interface PlanningQueryService {
  readonly services: (
    query: ListPlanningServicesQuery
  ) => Promise<readonly PlanningServiceRecord[]>;
  readonly service: (query: GetPlanningServiceQuery) => Promise<PlanningServiceRecord | null>;
  readonly serviceAssignments: (
    query: ListPlanningServiceAssignmentsQuery
  ) => Promise<readonly PlanningAssignmentRecord[]>;
  readonly serviceTemplates: (
    query: ListPlanningServiceTemplatesQuery
  ) => Promise<readonly PlanningServiceTemplateRecord[]>;
  readonly songLibrary: (
    query: ListPlanningSongLibraryQuery
  ) => Promise<readonly PlanningSongLibraryItemRecord[]>;
  readonly serviceReadiness: (
    query: GetPlanningServiceReadinessQuery
  ) => Promise<PlanningReadinessResult | null>;
}

export const createPlanningQueryService = (
  dependencies: PlanningQueryServiceDependencies
): PlanningQueryService => ({
  services: async (
    rawQuery: ListPlanningServicesQuery
  ): Promise<readonly PlanningServiceRecord[]> => {
    const query = ListPlanningServicesQuerySchema.parse(rawQuery);
    assertPlanningQueryRole(query.actor);

    return z
      .array(PlanningServiceRecordSchema)
      .parse(
        await dependencies.planningRepository.listServices(toPlanningReadOperation(query))
      )
      .map((service) => assertTenantScopedService(service, query.actor.tenantId));
  },

  service: async (rawQuery: GetPlanningServiceQuery): Promise<PlanningServiceRecord | null> => {
    const query = GetPlanningServiceQuerySchema.parse(rawQuery);
    assertPlanningQueryRole(query.actor);

    const service = await dependencies.planningRepository.getService(
      toPlanningReadOperation(query)
    );

    return service === null
      ? null
      : assertTenantScopedService(service, query.actor.tenantId, query.input.serviceId);
  },

  serviceAssignments: async (
    rawQuery: ListPlanningServiceAssignmentsQuery
  ): Promise<readonly PlanningAssignmentRecord[]> => {
    const query = ListPlanningServiceAssignmentsQuerySchema.parse(rawQuery);
    assertPlanningQueryRole(query.actor);

    return z
      .array(PlanningAssignmentRecordSchema)
      .parse(
        await dependencies.planningRepository.listServiceAssignments(
          toPlanningReadOperation(query)
        )
      )
      .map((assignment) =>
        assertTenantScopedAssignment(
          assignment,
          query.actor.tenantId,
          query.input.serviceId
        )
      );
  },

  serviceTemplates: async (
    rawQuery: ListPlanningServiceTemplatesQuery
  ): Promise<readonly PlanningServiceTemplateRecord[]> => {
    const query = ListPlanningServiceTemplatesQuerySchema.parse(rawQuery);
    assertPlanningQueryRole(query.actor);

    return z
      .array(PlanningServiceTemplateRecordSchema)
      .parse(
        await dependencies.planningRepository.listServiceTemplates(
          toPlanningReadOperation(query)
        )
      )
      .map((template) =>
        assertTenantScopedTemplate(
          template,
          query.actor.tenantId,
          query.input.serviceTypeId
        )
      );
  },

  songLibrary: async (
    rawQuery: ListPlanningSongLibraryQuery
  ): Promise<readonly PlanningSongLibraryItemRecord[]> => {
    const query = ListPlanningSongLibraryQuerySchema.parse(rawQuery);
    assertPlanningQueryRole(query.actor);

    return z
      .array(PlanningSongLibraryItemRecordSchema)
      .parse(
        await dependencies.planningRepository.listSongLibrary(
          toPlanningReadOperation(query)
        )
      )
      .map((song) =>
        assertTenantScopedSongLibraryItem(
          song,
          query.actor.tenantId,
          query.input.searchInput.includeBannedOrPaused === true
        )
      );
  },

  serviceReadiness: async (
    rawQuery: GetPlanningServiceReadinessQuery
  ): Promise<PlanningReadinessResult | null> => {
    const query = GetPlanningServiceReadinessQuerySchema.parse(rawQuery);
    assertPlanningQueryRole(query.actor);

    const readiness = await dependencies.planningRepository.getServiceReadiness(
      toPlanningReadOperation(query)
    );

    return readiness === null
      ? null
      : assertTenantScopedReadiness(readiness, query.actor.tenantId, query.input.serviceId);
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

const assertPlanningQueryRole = (actor: AuthenticatedActor): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningServiceQueryRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error("Actor is not allowed to read planning services.");
  }
};

const assertTenantScopedService = (
  rawService: PlanningServiceRecord,
  expectedTenantId: string,
  expectedServiceId?: string
): PlanningServiceRecord => {
  const service = PlanningServiceRecordSchema.parse(rawService);

  if (service.tenantId !== expectedTenantId) {
    throw new Error("Planning service query tenant mismatch.");
  }

  if (expectedServiceId !== undefined && service.serviceId !== expectedServiceId) {
    throw new Error("Planning service query service mismatch.");
  }

  return service;
};

const assertTenantScopedAssignment = (
  rawAssignment: PlanningAssignmentRecord,
  expectedTenantId: string,
  expectedServiceId: string
): PlanningAssignmentRecord => {
  const assignment = PlanningAssignmentRecordSchema.parse(rawAssignment);

  if (assignment.tenantId !== expectedTenantId) {
    throw new Error("Planning assignment query tenant mismatch.");
  }

  if (assignment.serviceId !== expectedServiceId) {
    throw new Error("Planning assignment query service mismatch.");
  }

  return assignment;
};

const assertTenantScopedTemplate = (
  rawTemplate: PlanningServiceTemplateRecord,
  expectedTenantId: string,
  expectedServiceTypeId: string
): PlanningServiceTemplateRecord => {
  const template = PlanningServiceTemplateRecordSchema.parse(rawTemplate);

  if (template.tenantId !== expectedTenantId) {
    throw new Error("Planning service template query tenant mismatch.");
  }

  if (template.serviceTypeId !== expectedServiceTypeId) {
    throw new Error("Planning service template query service type mismatch.");
  }

  return template;
};

const assertTenantScopedSongLibraryItem = (
  rawSong: PlanningSongLibraryItemRecord,
  expectedTenantId: string,
  includeBannedOrPaused: boolean
): PlanningSongLibraryItemRecord => {
  const song = PlanningSongLibraryItemRecordSchema.parse(rawSong);

  if (song.tenantId !== expectedTenantId) {
    throw new Error("Planning song library query tenant mismatch.");
  }

  if (!includeBannedOrPaused && song.isBannedOrPaused) {
    throw new Error("Planning song library query returned paused song.");
  }

  return song;
};

const assertTenantScopedReadiness = (
  rawReadiness: PlanningReadinessResult,
  expectedTenantId: string,
  expectedServiceId: string
): PlanningReadinessResult => {
  const readiness = PlanningReadinessResultSchema.parse(rawReadiness);

  if (readiness.tenantId !== expectedTenantId) {
    throw new Error("Planning readiness query tenant mismatch.");
  }

  if (readiness.serviceId !== expectedServiceId) {
    throw new Error("Planning readiness query service mismatch.");
  }

  return readiness;
};
