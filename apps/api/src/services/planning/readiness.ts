import { z } from "zod";
import type { AuthenticatedActor } from "../../auth/index.js";
import { ApiRoleSchema } from "../../auth/index.js";
import type { EventPublisher } from "../../events/index.js";
import { ApiEventEnvelopeSchema, ReadinessUpdatedEventPayloadSchema } from "../../events/index.js";
import {
  calculatePlanningReadiness,
  PlanningReadinessInputSchema,
  PlanningReadinessResultSchema,
  type PlanningReadinessInput,
  type PlanningReadinessResult
} from "../../domain/planning/readiness.js";

const NonEmptyStringSchema = z.string().min(1);

export const PlanningReadinessServiceRoleSchema = ApiRoleSchema.extract([
  "church_admin",
  "worship_leader",
  "planner"
]);

export const RefreshPlanningReadinessCommandSchema = z.object({
  actor: z.object({
    actorId: NonEmptyStringSchema,
    roles: z.array(ApiRoleSchema).min(1),
    tenantId: NonEmptyStringSchema
  }),
  requestId: NonEmptyStringSchema,
  serviceId: NonEmptyStringSchema
});

export type PlanningReadinessServiceRole = z.infer<typeof PlanningReadinessServiceRoleSchema>;
export type RefreshPlanningReadinessCommand = z.infer<typeof RefreshPlanningReadinessCommandSchema>;
export type PlanningReadinessUpdatedPayload = z.infer<
  typeof ReadinessUpdatedEventPayloadSchema
>;

export interface PlanningReadinessRepository {
  readonly loadReadinessInput: (query: {
    readonly requestId: string;
    readonly serviceId: string;
    readonly tenantId: string;
  }) => Promise<PlanningReadinessInput>;
  readonly saveReadinessResult: (command: {
    readonly actorId: string;
    readonly requestId: string;
    readonly result: PlanningReadinessResult;
    readonly serviceId: string;
    readonly tenantId: string;
  }) => Promise<void>;
}

export interface PlanningReadinessServiceDependencies {
  readonly eventPublisher: EventPublisher;
  readonly readinessRepository: PlanningReadinessRepository;
}

export interface PlanningReadinessService {
  readonly refreshReadinessScore: (
    command: RefreshPlanningReadinessCommand
  ) => Promise<PlanningReadinessResult>;
}

export const createPlanningReadinessService = (
  dependencies: PlanningReadinessServiceDependencies
): PlanningReadinessService => ({
  refreshReadinessScore: async (
    rawCommand: RefreshPlanningReadinessCommand
  ): Promise<PlanningReadinessResult> => {
    const command = RefreshPlanningReadinessCommandSchema.parse(rawCommand);
    assertPlanningReadinessRole(command.actor);

    const readinessInput = PlanningReadinessInputSchema.parse(
      await dependencies.readinessRepository.loadReadinessInput({
        requestId: command.requestId,
        serviceId: command.serviceId,
        tenantId: command.actor.tenantId
      })
    );

    if (readinessInput.tenantId !== command.actor.tenantId) {
      throw new Error("Planning readiness input tenant mismatch.");
    }

    if (readinessInput.serviceId !== command.serviceId) {
      throw new Error("Planning readiness input service mismatch.");
    }

    const result = calculatePlanningReadiness(readinessInput);

    await dependencies.readinessRepository.saveReadinessResult({
      actorId: command.actor.actorId,
      requestId: command.requestId,
      result,
      serviceId: command.serviceId,
      tenantId: command.actor.tenantId
    });

    const payload = ReadinessUpdatedEventPayloadSchema.parse({
      band: result.band,
      readinessScore: result.readinessScore,
      serviceId: result.serviceId
    });

    await dependencies.eventPublisher.publishAfterCommit(
      ApiEventEnvelopeSchema.parse({
        aggregateId: result.serviceId,
        actorId: command.actor.actorId,
        eventType: "readiness.updated",
        occurredAt: new Date().toISOString(),
        payload,
        requestId: command.requestId,
        schemaVersion: "planning-readiness.v1",
        tenantId: command.actor.tenantId
      })
    );

    return PlanningReadinessResultSchema.parse(result);
  }
});

const assertPlanningReadinessRole = (actor: AuthenticatedActor): void => {
  const hasPlanningRole = actor.roles.some((role) =>
    PlanningReadinessServiceRoleSchema.safeParse(role).success
  );

  if (!hasPlanningRole) {
    throw new Error("Actor is not allowed to refresh planning readiness.");
  }
};
