import { z } from "zod";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema, AuthenticatedActorSchema } from "../../auth/index.js";
import type { EventPublisher } from "../../events/index.js";
import type {
  PlanningPersistenceOperation,
  PlanningServiceCommandPersistenceRepository,
  RepositoryMutationIntent
} from "@sanctuary-os/db";
import {
  ApiEventEnvelopeSchema,
  AssignmentStatusChangedEventPayloadSchema,
  ServicePublishedEventPayloadSchema
} from "../../events/index.js";
import { PlanningAssignmentStatusSchema } from "../../domain/planning/readiness.js";

const NonEmptyStringSchema = z.string().min(1);
const OptionalNonEmptyStringSchema = NonEmptyStringSchema.optional();

export const PlanningServiceCommandRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner"
]);

export const PlanningServiceStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "canceled"
]);

export const PlanningServiceItemTypeSchema = z.enum([
  "song",
  "scripture",
  "prayer",
  "announcement",
  "message",
  "media",
  "other"
]);

export const PlanningConfirmationIntentSchema = z.object({
  confirmed: z.literal(true),
  reason: NonEmptyStringSchema
});

export const PlanningServiceRecordSchema = z.object({
  serviceId: NonEmptyStringSchema,
  serviceTypeId: NonEmptyStringSchema,
  startsAt: z.string().datetime().optional(),
  status: PlanningServiceStatusSchema,
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningServiceItemRecordSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  notes: OptionalNonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  serviceItemId: NonEmptyStringSchema,
  songId: OptionalNonEmptyStringSchema,
  sortOrder: z.number().int().nonnegative(),
  tenantId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  type: PlanningServiceItemTypeSchema
});

export const PlanningAssignmentRecordSchema = z.object({
  assignmentId: NonEmptyStringSchema,
  personId: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  status: PlanningAssignmentStatusSchema,
  tenantId: NonEmptyStringSchema
});

export const PlanningSetlistSongCandidateSchema = z.object({
  artist: OptionalNonEmptyStringSchema,
  availableKeys: z.array(NonEmptyStringSchema).default([]),
  defaultKey: OptionalNonEmptyStringSchema,
  isBannedOrPaused: z.boolean().default(false),
  songId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  usageCount: z.number().int().nonnegative().default(0)
});

export const PlanningSetlistRecommendationSchema = z.object({
  key: OptionalNonEmptyStringSchema,
  rationale: NonEmptyStringSchema,
  serviceMoment: OptionalNonEmptyStringSchema,
  songId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningSetlistAlternativeSchema = z.object({
  reason: NonEmptyStringSchema,
  songId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningSetlistPromptResultSchema = z.object({
  alternatives: z.array(PlanningSetlistAlternativeSchema).default([]),
  confidence: z.number().min(0).max(1),
  flowAnalysis: NonEmptyStringSchema,
  needsReview: z.literal(true),
  recommendedSetlist: z.array(PlanningSetlistRecommendationSchema),
  reviewNotes: z.array(NonEmptyStringSchema).min(1),
  status: z.enum(["suggested", "insufficient_context", "blocked"]),
  usageWarnings: z.array(NonEmptyStringSchema)
});

export const PlanningGeneratedSetlistResultSchema =
  PlanningSetlistPromptResultSchema.extend({
    generatedByActorId: NonEmptyStringSchema,
    humanReview: z.object({
      gate: z.literal("ai-suggested-write"),
      required: z.literal(true)
    }),
    persisted: z.literal(false),
    requestId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    tenantId: NonEmptyStringSchema
  });

const PlanningCommandBaseSchema = z.object({
  actor: AuthenticatedActorSchema,
  requestId: NonEmptyStringSchema
});

export const CreatePlanningServiceCommandSchema = PlanningCommandBaseSchema.extend({
  input: z.object({
    serviceTypeId: NonEmptyStringSchema,
    startsAt: z.string().datetime().optional(),
    title: NonEmptyStringSchema
  })
});

export const DuplicatePlanningServiceFromTemplateCommandSchema =
  PlanningCommandBaseSchema.extend({
    input: z.object({
      serviceTemplateId: NonEmptyStringSchema,
      startsAt: z.string().datetime().optional(),
      title: NonEmptyStringSchema
    })
  });

export const UpdatePlanningServiceCommandSchema = PlanningCommandBaseSchema.extend({
  input: z
    .object({
      confirmationIntent: PlanningConfirmationIntentSchema.optional(),
      serviceId: NonEmptyStringSchema,
      serviceTypeId: OptionalNonEmptyStringSchema,
      startsAt: z.string().datetime().optional(),
      status: PlanningServiceStatusSchema.optional(),
      title: OptionalNonEmptyStringSchema
    })
    .superRefine((input, context) => {
      if (
        (input.status === "published" || input.status === "canceled") &&
        input.confirmationIntent === undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Publishing or canceling a service requires explicit confirmation intent.",
          path: ["confirmationIntent"]
        });
      }
    })
});

export const AddPlanningServiceItemCommandSchema = PlanningCommandBaseSchema.extend({
  input: z.object({
    durationMinutes: z.number().int().positive().optional(),
    notes: OptionalNonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    songId: OptionalNonEmptyStringSchema,
    title: NonEmptyStringSchema,
    type: PlanningServiceItemTypeSchema
  })
});

export const UpdatePlanningServiceItemCommandSchema = PlanningCommandBaseSchema.extend({
  input: z.object({
    durationMinutes: z.number().int().positive().optional(),
    notes: OptionalNonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    serviceItemId: NonEmptyStringSchema,
    songId: OptionalNonEmptyStringSchema,
    title: OptionalNonEmptyStringSchema,
    type: PlanningServiceItemTypeSchema.optional()
  })
});

export const ReorderPlanningServiceItemsCommandSchema = PlanningCommandBaseSchema.extend({
  input: z
    .object({
      orderedServiceItemIds: z.array(NonEmptyStringSchema).min(1),
      serviceId: NonEmptyStringSchema
    })
    .superRefine((input, context) => {
      if (new Set(input.orderedServiceItemIds).size !== input.orderedServiceItemIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Service item order cannot contain duplicate item IDs.",
          path: ["orderedServiceItemIds"]
        });
      }
    })
});

export const AssignPlanningVolunteerCommandSchema = PlanningCommandBaseSchema.extend({
  input: z.object({
    personId: NonEmptyStringSchema,
    roleId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema
  })
});

export const UpdatePlanningAssignmentStatusCommandSchema = PlanningCommandBaseSchema.extend({
  input: z.object({
    assignmentId: NonEmptyStringSchema,
    serviceId: NonEmptyStringSchema,
    status: PlanningAssignmentStatusSchema
  })
});

export const GeneratePlanningSetlistCommandSchema = PlanningCommandBaseSchema.extend({
  input: z
    .object({
      churchContextSummary: NonEmptyStringSchema,
      churchPreferences: z.array(NonEmptyStringSchema).default([]),
      planningConstraints: z.array(NonEmptyStringSchema).default([]),
      recentUsageHistory: z.array(NonEmptyStringSchema).default([]),
      scriptureReference: OptionalNonEmptyStringSchema,
      sermonTheme: OptionalNonEmptyStringSchema,
      serviceId: NonEmptyStringSchema,
      serviceType: NonEmptyStringSchema,
      songLibrary: z.array(PlanningSetlistSongCandidateSchema).min(1),
      targetSetLength: z.number().int().min(1).max(12)
    })
    .superRefine((input, context) => {
      const availableSongCount = input.songLibrary.filter(
        (song) => !song.isBannedOrPaused
      ).length;

      if (availableSongCount === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Setlist generation requires at least one available song.",
          path: ["songLibrary"]
        });
      }

      if (input.targetSetLength > availableSongCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Target set length cannot exceed available song count.",
          path: ["targetSetLength"]
        });
      }
    })
});

export const PlanningSetlistPromptRequestSchema = z.object({
  churchContextSummary: NonEmptyStringSchema,
  churchPreferences: z.array(NonEmptyStringSchema),
  planningConstraints: z.array(NonEmptyStringSchema),
  recentUsageHistory: z.array(NonEmptyStringSchema),
  requestId: NonEmptyStringSchema,
  scriptureReference: OptionalNonEmptyStringSchema,
  sermonTheme: OptionalNonEmptyStringSchema,
  serviceId: NonEmptyStringSchema,
  serviceType: NonEmptyStringSchema,
  songLibrary: z.array(PlanningSetlistSongCandidateSchema).min(1),
  targetSetLength: z.number().int().min(1).max(12),
  tenantId: NonEmptyStringSchema
});

export type PlanningServiceCommandRole = z.infer<typeof PlanningServiceCommandRoleSchema>;
export type PlanningServiceStatus = z.infer<typeof PlanningServiceStatusSchema>;
export type PlanningServiceItemType = z.infer<typeof PlanningServiceItemTypeSchema>;
export type PlanningConfirmationIntent = z.infer<typeof PlanningConfirmationIntentSchema>;
export type PlanningServiceRecord = z.infer<typeof PlanningServiceRecordSchema>;
export type PlanningServiceItemRecord = z.infer<typeof PlanningServiceItemRecordSchema>;
export type PlanningAssignmentRecord = z.infer<typeof PlanningAssignmentRecordSchema>;
export type PlanningSetlistSongCandidate = z.infer<
  typeof PlanningSetlistSongCandidateSchema
>;
export type PlanningSetlistRecommendation = z.infer<
  typeof PlanningSetlistRecommendationSchema
>;
export type PlanningSetlistPromptResult = z.infer<
  typeof PlanningSetlistPromptResultSchema
>;
export type PlanningGeneratedSetlistResult = z.infer<
  typeof PlanningGeneratedSetlistResultSchema
>;
export type CreatePlanningServiceCommand = z.infer<typeof CreatePlanningServiceCommandSchema>;
export type DuplicatePlanningServiceFromTemplateCommand = z.infer<
  typeof DuplicatePlanningServiceFromTemplateCommandSchema
>;
export type UpdatePlanningServiceCommand = z.infer<typeof UpdatePlanningServiceCommandSchema>;
export type AddPlanningServiceItemCommand = z.infer<typeof AddPlanningServiceItemCommandSchema>;
export type UpdatePlanningServiceItemCommand = z.infer<
  typeof UpdatePlanningServiceItemCommandSchema
>;
export type ReorderPlanningServiceItemsCommand = z.infer<
  typeof ReorderPlanningServiceItemsCommandSchema
>;
export type AssignPlanningVolunteerCommand = z.infer<
  typeof AssignPlanningVolunteerCommandSchema
>;
export type UpdatePlanningAssignmentStatusCommand = z.infer<
  typeof UpdatePlanningAssignmentStatusCommandSchema
>;
export type GeneratePlanningSetlistCommand = z.infer<
  typeof GeneratePlanningSetlistCommandSchema
>;
export type PlanningSetlistPromptRequest = z.infer<
  typeof PlanningSetlistPromptRequestSchema
>;

export interface PlanningCommandRepository {
  readonly createService: PlanningServiceCommandPersistenceRepository["createService"];
  readonly duplicateServiceFromTemplate: PlanningServiceCommandPersistenceRepository["duplicateServiceFromTemplate"];
  readonly updateService: PlanningServiceCommandPersistenceRepository["updateService"];
  readonly addServiceItem: PlanningServiceCommandPersistenceRepository["addServiceItem"];
  readonly updateServiceItem: PlanningServiceCommandPersistenceRepository["updateServiceItem"];
  readonly reorderServiceItems: PlanningServiceCommandPersistenceRepository["reorderServiceItems"];
  readonly assignVolunteer: PlanningServiceCommandPersistenceRepository["assignVolunteer"];
  readonly updateAssignmentStatus: PlanningServiceCommandPersistenceRepository["updateAssignmentStatus"];
}

export interface PlanningCommandServiceDependencies {
  readonly eventPublisher: EventPublisher;
  readonly setlistGenerator?: PlanningSetlistGenerator;
  readonly planningRepository: PlanningCommandRepository;
}

export interface PlanningSetlistGenerator {
  readonly generateSetlist: (request: PlanningSetlistPromptRequest) => Promise<unknown>;
}

export interface PlanningCommandService {
  readonly createService: (
    command: CreatePlanningServiceCommand
  ) => Promise<PlanningServiceRecord>;
  readonly duplicateServiceFromTemplate: (
    command: DuplicatePlanningServiceFromTemplateCommand
  ) => Promise<PlanningServiceRecord>;
  readonly updateService: (
    command: UpdatePlanningServiceCommand
  ) => Promise<PlanningServiceRecord>;
  readonly addServiceItem: (
    command: AddPlanningServiceItemCommand
  ) => Promise<PlanningServiceItemRecord>;
  readonly updateServiceItem: (
    command: UpdatePlanningServiceItemCommand
  ) => Promise<PlanningServiceItemRecord>;
  readonly reorderServiceItems: (
    command: ReorderPlanningServiceItemsCommand
  ) => Promise<readonly PlanningServiceItemRecord[]>;
  readonly assignVolunteer: (
    command: AssignPlanningVolunteerCommand
  ) => Promise<PlanningAssignmentRecord>;
  readonly updateAssignmentStatus: (
    command: UpdatePlanningAssignmentStatusCommand
  ) => Promise<PlanningAssignmentRecord>;
  readonly generateSetlist: (
    command: GeneratePlanningSetlistCommand
  ) => Promise<PlanningGeneratedSetlistResult>;
}

export const createPlanningCommandService = (
  dependencies: PlanningCommandServiceDependencies
): PlanningCommandService => ({
  createService: async (
    rawCommand: CreatePlanningServiceCommand
  ): Promise<PlanningServiceRecord> => {
    const command = CreatePlanningServiceCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    return assertTenantScopedService(
      await dependencies.planningRepository.createService(
        toPlanningPersistenceOperation(command, "create")
      ),
      command.actor.tenantId
    );
  },

  duplicateServiceFromTemplate: async (
    rawCommand: DuplicatePlanningServiceFromTemplateCommand
  ): Promise<PlanningServiceRecord> => {
    const command = DuplicatePlanningServiceFromTemplateCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    const service = assertTenantScopedService(
      await dependencies.planningRepository.duplicateServiceFromTemplate(
        toPlanningPersistenceOperation(command, "create")
      ),
      command.actor.tenantId
    );

    if (service.title !== command.input.title) {
      throw new Error("Planning duplicate service command title mismatch.");
    }

    if (
      command.input.startsAt !== undefined &&
      service.startsAt !== command.input.startsAt
    ) {
      throw new Error("Planning duplicate service command start time mismatch.");
    }

    return service;
  },

  updateService: async (
    rawCommand: UpdatePlanningServiceCommand
  ): Promise<PlanningServiceRecord> => {
    const command = UpdatePlanningServiceCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    const service = assertTenantScopedService(
      await dependencies.planningRepository.updateService(
        toPlanningPersistenceOperation(command, planningServiceMutationIntent(command))
      ),
      command.actor.tenantId
    );

    if (service.serviceId !== command.input.serviceId) {
      throw new Error("Planning service command service mismatch.");
    }

    if (service.status === "published") {
      await publishServicePublishedEvent(dependencies.eventPublisher, command, service);
    }

    return service;
  },

  addServiceItem: async (
    rawCommand: AddPlanningServiceItemCommand
  ): Promise<PlanningServiceItemRecord> => {
    const command = AddPlanningServiceItemCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    return assertTenantScopedServiceItem(
      await dependencies.planningRepository.addServiceItem(
        toPlanningPersistenceOperation(command, "create")
      ),
      command.input.serviceId,
      command.actor.tenantId
    );
  },

  updateServiceItem: async (
    rawCommand: UpdatePlanningServiceItemCommand
  ): Promise<PlanningServiceItemRecord> => {
    const command = UpdatePlanningServiceItemCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    const serviceItem = assertTenantScopedServiceItem(
      await dependencies.planningRepository.updateServiceItem(
        toPlanningPersistenceOperation(command, "update")
      ),
      command.input.serviceId,
      command.actor.tenantId
    );

    if (serviceItem.serviceItemId !== command.input.serviceItemId) {
      throw new Error("Planning service item command item mismatch.");
    }

    return serviceItem;
  },

  reorderServiceItems: async (
    rawCommand: ReorderPlanningServiceItemsCommand
  ): Promise<readonly PlanningServiceItemRecord[]> => {
    const command = ReorderPlanningServiceItemsCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    return z
      .array(PlanningServiceItemRecordSchema)
      .parse(
        await dependencies.planningRepository.reorderServiceItems(
          toPlanningPersistenceOperation(command, "update")
        )
      )
      .map((serviceItem) =>
        assertTenantScopedServiceItem(
          serviceItem,
          command.input.serviceId,
          command.actor.tenantId
        )
      );
  },

  assignVolunteer: async (
    rawCommand: AssignPlanningVolunteerCommand
  ): Promise<PlanningAssignmentRecord> => {
    const command = AssignPlanningVolunteerCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    return assertTenantScopedAssignment(
      await dependencies.planningRepository.assignVolunteer(
        toPlanningPersistenceOperation(command, "create")
      ),
      command.input.serviceId,
      command.actor.tenantId
    );
  },

  updateAssignmentStatus: async (
    rawCommand: UpdatePlanningAssignmentStatusCommand
  ): Promise<PlanningAssignmentRecord> => {
    const command = UpdatePlanningAssignmentStatusCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    const assignment = assertTenantScopedAssignment(
      await dependencies.planningRepository.updateAssignmentStatus(
        toPlanningPersistenceOperation(command, "update")
      ),
      command.input.serviceId,
      command.actor.tenantId
    );

    if (assignment.assignmentId !== command.input.assignmentId) {
      throw new Error("Planning assignment command assignment mismatch.");
    }

    await dependencies.eventPublisher.publishAfterCommit(
      ApiEventEnvelopeSchema.parse({
        aggregateId: assignment.serviceId,
        actorId: command.actor.actorId,
        eventType: "assignment.statusChanged",
        occurredAt: new Date().toISOString(),
        payload: AssignmentStatusChangedEventPayloadSchema.parse({
          assignmentId: assignment.assignmentId,
          serviceId: assignment.serviceId,
          status: assignment.status
        }),
        schemaVersion: "planning-assignment-status.v1",
        tenantId: assignment.tenantId
      })
    );

    return assignment;
  },

  generateSetlist: async (
    rawCommand: GeneratePlanningSetlistCommand
  ): Promise<PlanningGeneratedSetlistResult> => {
    const command = GeneratePlanningSetlistCommandSchema.parse(rawCommand);
    assertPlanningCommandRole(command.actor);

    const generator = dependencies.setlistGenerator;

    if (generator === undefined) {
      throw new Error("Planning setlist generator is not configured.");
    }

    const promptRequest = PlanningSetlistPromptRequestSchema.parse({
      ...command.input,
      requestId: command.requestId,
      tenantId: command.actor.tenantId
    });
    const promptResult = PlanningSetlistPromptResultSchema.parse(
      await generator.generateSetlist(promptRequest)
    );

    assertGeneratedSongsFromLibrary(promptResult, command.input.songLibrary);

    return PlanningGeneratedSetlistResultSchema.parse({
      ...promptResult,
      generatedByActorId: command.actor.actorId,
      humanReview: {
        gate: "ai-suggested-write",
        required: true
      },
      persisted: false,
      requestId: command.requestId,
      serviceId: command.input.serviceId,
      tenantId: command.actor.tenantId
    });
  }
});

const toPlanningPersistenceOperation = <TInput>(
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

const planningServiceMutationIntent = (
  command: UpdatePlanningServiceCommand
): RepositoryMutationIntent =>
  command.input.status === "published" || command.input.status === "canceled"
    ? "destructive-confirmed"
    : "update";

const assertPlanningCommandRole = (actor: AuthenticatedActor): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningServiceCommandRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error("Actor is not allowed to mutate planning services.");
  }
};

const assertTenantScopedService = (
  rawService: PlanningServiceRecord,
  expectedTenantId: string
): PlanningServiceRecord => {
  const service = PlanningServiceRecordSchema.parse(rawService);

  if (service.tenantId !== expectedTenantId) {
    throw new Error("Planning service command tenant mismatch.");
  }

  return service;
};

const assertTenantScopedServiceItem = (
  rawServiceItem: PlanningServiceItemRecord,
  expectedServiceId: string,
  expectedTenantId: string
): PlanningServiceItemRecord => {
  const serviceItem = PlanningServiceItemRecordSchema.parse(rawServiceItem);

  if (serviceItem.tenantId !== expectedTenantId) {
    throw new Error("Planning service item command tenant mismatch.");
  }

  if (serviceItem.serviceId !== expectedServiceId) {
    throw new Error("Planning service item command service mismatch.");
  }

  return serviceItem;
};

const assertTenantScopedAssignment = (
  rawAssignment: PlanningAssignmentRecord,
  expectedServiceId: string,
  expectedTenantId: string
): PlanningAssignmentRecord => {
  const assignment = PlanningAssignmentRecordSchema.parse(rawAssignment);

  if (assignment.tenantId !== expectedTenantId) {
    throw new Error("Planning assignment command tenant mismatch.");
  }

  if (assignment.serviceId !== expectedServiceId) {
    throw new Error("Planning assignment command service mismatch.");
  }

  return assignment;
};

const publishServicePublishedEvent = async (
  eventPublisher: EventPublisher,
  command: UpdatePlanningServiceCommand,
  service: PlanningServiceRecord
): Promise<void> => {
  await eventPublisher.publishAfterCommit(
    ApiEventEnvelopeSchema.parse({
      aggregateId: service.serviceId,
      actorId: command.actor.actorId,
      eventType: "service.published",
      occurredAt: new Date().toISOString(),
      payload: ServicePublishedEventPayloadSchema.parse({
        serviceId: service.serviceId,
        status: service.status
      }),
      schemaVersion: "planning-service-published.v1",
      tenantId: service.tenantId
    })
  );
};

const assertGeneratedSongsFromLibrary = (
  result: PlanningSetlistPromptResult,
  songLibrary: readonly PlanningSetlistSongCandidate[]
): void => {
  const availableSongIds = new Set(
    songLibrary.filter((song) => !song.isBannedOrPaused).map((song) => song.songId)
  );

  for (const recommendation of result.recommendedSetlist) {
    if (!availableSongIds.has(recommendation.songId)) {
      throw new Error("Planning generated setlist includes unavailable song.");
    }
  }
};
