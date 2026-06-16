import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);

export const PlanningAssignmentStatusSchema = z.enum(["pending", "confirmed", "declined"]);
export const PlanningCcliReadinessStatusSchema = z.enum([
  "not-required",
  "current",
  "pending",
  "missing",
  "skipped"
]);

export const PlanningRequiredRoleSchema = z.object({
  displayName: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema
});

export const PlanningAssignmentReadinessSignalSchema = z.object({
  assignmentId: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema,
  status: PlanningAssignmentStatusSchema
});

export const PlanningRehearsalAcknowledgementReadinessSignalSchema = z.enum([
  "ready",
  "needs-practice",
  "blocked"
]);

export const PlanningRehearsalAcknowledgementReadinessInputSchema = z.object({
  assignmentId: NonEmptyStringSchema,
  assetId: NonEmptyStringSchema.optional(),
  personId: NonEmptyStringSchema,
  readinessSignal: PlanningRehearsalAcknowledgementReadinessSignalSchema,
  serviceItemId: NonEmptyStringSchema
});

export const PlanningCcliStatusReadinessInputSchema = z
  .object({
    serviceItemId: NonEmptyStringSchema,
    status: PlanningCcliReadinessStatusSchema
  })
  .strict();

export const PlanningServiceItemReadinessSignalSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  hasAttachedSong: z.boolean().default(false),
  hasChart: z.boolean().default(false),
  hasCurrentCcliLog: z.boolean().default(false),
  hasVisibleRehearsalAsset: z.boolean().default(false),
  requiresRehearsalAcknowledgement: z.boolean().default(false),
  requiresCcliLog: z.boolean().default(false),
  serviceItemId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningReadinessInputSchema = z
  .object({
    assignments: z.array(PlanningAssignmentReadinessSignalSchema),
    ccliStatuses: z.array(PlanningCcliStatusReadinessInputSchema).default([]),
    knownBlockers: z.array(NonEmptyStringSchema).default([]),
    rehearsalAcknowledgements: z
      .array(PlanningRehearsalAcknowledgementReadinessInputSchema)
      .default([]),
    requiredRoles: z.array(PlanningRequiredRoleSchema),
    serviceId: NonEmptyStringSchema,
    serviceItems: z.array(PlanningServiceItemReadinessSignalSchema),
    tenantId: NonEmptyStringSchema
  })
  .superRefine((input, context) => {
    const assignmentIds = new Set(
      input.assignments.map((assignment) => assignment.assignmentId)
    );
    const serviceItemIds = new Set(
      input.serviceItems.map((item) => item.serviceItemId)
    );

    input.rehearsalAcknowledgements.forEach((acknowledgement, index) => {
      if (!assignmentIds.has(acknowledgement.assignmentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rehearsal acknowledgement references an unknown assignment.",
          path: ["rehearsalAcknowledgements", index, "assignmentId"]
        });
      }

      if (!serviceItemIds.has(acknowledgement.serviceItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rehearsal acknowledgement references an unknown service item.",
          path: ["rehearsalAcknowledgements", index, "serviceItemId"]
        });
      }
    });

    input.ccliStatuses.forEach((status, index) => {
      if (!serviceItemIds.has(status.serviceItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CCLI status references an unknown service item.",
          path: ["ccliStatuses", index, "serviceItemId"]
        });
      }
    });
  });

export const PlanningReadinessBandSchema = z.enum(["blocked", "needs-attention", "ready"]);

export const PlanningReadinessCheckSchema = z.object({
  code: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  maxScore: z.number().int().positive(),
  score: z.number().int().nonnegative()
});

export const PlanningReadinessResultSchema = z.object({
  band: PlanningReadinessBandSchema,
  checks: z.array(PlanningReadinessCheckSchema),
  recommendedActions: z.array(NonEmptyStringSchema),
  readinessScore: z.number().int().min(0).max(100),
  risks: z.array(NonEmptyStringSchema),
  serviceId: NonEmptyStringSchema,
  strengths: z.array(NonEmptyStringSchema),
  tenantId: NonEmptyStringSchema
});

export type PlanningAssignmentReadinessSignal = z.infer<
  typeof PlanningAssignmentReadinessSignalSchema
>;
export type PlanningAssignmentStatus = z.infer<typeof PlanningAssignmentStatusSchema>;
export type PlanningCcliReadinessStatus = z.infer<
  typeof PlanningCcliReadinessStatusSchema
>;
export type PlanningCcliStatusReadinessInput = z.infer<
  typeof PlanningCcliStatusReadinessInputSchema
>;
export type PlanningReadinessBand = z.infer<typeof PlanningReadinessBandSchema>;
export type PlanningReadinessCheck = z.infer<typeof PlanningReadinessCheckSchema>;
export type PlanningReadinessInput = z.infer<typeof PlanningReadinessInputSchema>;
export type PlanningReadinessInputPayload = z.input<typeof PlanningReadinessInputSchema>;
export type PlanningReadinessResult = z.infer<typeof PlanningReadinessResultSchema>;
export type PlanningRehearsalAcknowledgementReadinessInput = z.infer<
  typeof PlanningRehearsalAcknowledgementReadinessInputSchema
>;
export type PlanningRehearsalAcknowledgementReadinessSignal = z.infer<
  typeof PlanningRehearsalAcknowledgementReadinessSignalSchema
>;
export type PlanningRequiredRole = z.infer<typeof PlanningRequiredRoleSchema>;
export type PlanningServiceItemReadinessSignal = z.infer<
  typeof PlanningServiceItemReadinessSignalSchema
>;

const READINESS_WEIGHTS = {
  ccliLogging: 10,
  confirmedAssignments: 20,
  requiredRoles: 25,
  rehearsalAcknowledgements: 10,
  rehearsalVisibility: 15,
  servicePlan: 10,
  songAssets: 10
} as const;

export const calculatePlanningReadiness = (
  rawInput: PlanningReadinessInputPayload
): PlanningReadinessResult => {
  const input = PlanningReadinessInputSchema.parse(rawInput);
  const requiredRoleCount = input.requiredRoles.length;
  const assignedRoleIds = new Set(input.assignments.map((assignment) => assignment.roleId));
  const coveredRequiredRoles = input.requiredRoles.filter((role) => assignedRoleIds.has(role.roleId));
  const confirmedAssignments = input.assignments.filter(
    (assignment) => assignment.status === "confirmed"
  );
  const declinedAssignments = input.assignments.filter((assignment) => assignment.status === "declined");
  const timedItems = input.serviceItems.filter((item) => item.durationMinutes !== undefined);
  const songItems = input.serviceItems.filter((item) => item.hasAttachedSong);
  const chartReadySongs = songItems.filter((item) => item.hasChart);
  const visibleAssetItems = input.serviceItems.filter((item) => item.hasVisibleRehearsalAsset);
  const acknowledgementRequiredItems = input.serviceItems.filter(
    (item) => item.requiresRehearsalAcknowledgement
  );
  const acknowledgedReadyItems = acknowledgementRequiredItems.filter((item) =>
    hasReadyRehearsalAcknowledgement(input.rehearsalAcknowledgements, item.serviceItemId)
  );
  const blockedAcknowledgements = input.rehearsalAcknowledgements.filter(
    (acknowledgement) => acknowledgement.readinessSignal === "blocked"
  );
  const needsPracticeAcknowledgements = input.rehearsalAcknowledgements.filter(
    (acknowledgement) => acknowledgement.readinessSignal === "needs-practice"
  );
  const ccliRequiredItems = input.serviceItems.filter((item) =>
    itemRequiresCcliStatus(item, input.ccliStatuses)
  );
  const ccliCurrentItems = ccliRequiredItems.filter((item) =>
    itemHasCurrentCcliStatus(item, input.ccliStatuses)
  );

  const checks: PlanningReadinessCheck[] = [
    scoreCheck(
      "required-roles",
      "Required roles assigned",
      coveredRequiredRoles.length,
      requiredRoleCount,
      READINESS_WEIGHTS.requiredRoles
    ),
    scoreCheck(
      "assignment-confirmations",
      "Assignments confirmed",
      confirmedAssignments.length,
      input.assignments.length,
      READINESS_WEIGHTS.confirmedAssignments
    ),
    scoreCheck(
      "service-items",
      "Service items ordered and timed",
      timedItems.length,
      input.serviceItems.length,
      READINESS_WEIGHTS.servicePlan
    ),
    scoreCheck(
      "song-assets",
      "Song charts available",
      chartReadySongs.length,
      songItems.length,
      READINESS_WEIGHTS.songAssets
    ),
    scoreCheck(
      "rehearsal-assets",
      "Rehearsal assets visible",
      visibleAssetItems.length,
      input.serviceItems.length,
      READINESS_WEIGHTS.rehearsalVisibility
    ),
    scoreCheck(
      "rehearsal-acknowledgements",
      "Rehearsal acknowledgements ready",
      acknowledgedReadyItems.length,
      acknowledgementRequiredItems.length,
      READINESS_WEIGHTS.rehearsalAcknowledgements
    ),
    scoreCheck(
      "ccli-logging",
      "CCLI logging current",
      ccliCurrentItems.length,
      ccliRequiredItems.length,
      READINESS_WEIGHTS.ccliLogging
    )
  ];

  const rawScore = checks.reduce((total, check) => total + check.score, 0);
  const acknowledgementPenalty = blockedAcknowledgements.length > 0 ? 10 : 0;
  const blockerPenalty = Math.min(input.knownBlockers.length * 10, 30);
  const practicePenalty = Math.min(needsPracticeAcknowledgements.length * 5, 10);
  const readinessScore = clampScore(
    rawScore - blockerPenalty - acknowledgementPenalty - practicePenalty
  );
  const risks = buildRisks(
    input,
    declinedAssignments,
    blockedAcknowledgements,
    needsPracticeAcknowledgements,
    checks
  );
  const strengths = buildStrengths(checks);
  const recommendedActions = buildRecommendedActions(
    input,
    declinedAssignments,
    blockedAcknowledgements,
    needsPracticeAcknowledgements,
    checks
  );

  return PlanningReadinessResultSchema.parse({
    band: readinessScore >= 80 ? "ready" : readinessScore >= 50 ? "needs-attention" : "blocked",
    checks,
    readinessScore,
    recommendedActions,
    risks,
    serviceId: input.serviceId,
    strengths,
    tenantId: input.tenantId
  });
};

const hasReadyRehearsalAcknowledgement = (
  acknowledgements: readonly PlanningRehearsalAcknowledgementReadinessInput[],
  serviceItemId: string
): boolean =>
  acknowledgements.some(
    (acknowledgement) =>
      acknowledgement.serviceItemId === serviceItemId &&
      acknowledgement.readinessSignal === "ready"
  );

const itemRequiresCcliStatus = (
  item: PlanningServiceItemReadinessSignal,
  ccliStatuses: readonly PlanningCcliStatusReadinessInput[]
): boolean => {
  const explicitStatus = ccliStatuses.find(
    (status) => status.serviceItemId === item.serviceItemId
  );

  return explicitStatus === undefined
    ? item.requiresCcliLog
    : explicitStatus.status !== "not-required";
};

const itemHasCurrentCcliStatus = (
  item: PlanningServiceItemReadinessSignal,
  ccliStatuses: readonly PlanningCcliStatusReadinessInput[]
): boolean => {
  const explicitStatus = ccliStatuses.find(
    (status) => status.serviceItemId === item.serviceItemId
  );

  return explicitStatus === undefined
    ? item.hasCurrentCcliLog
    : explicitStatus.status === "current";
};

const scoreCheck = (
  code: string,
  label: string,
  readyCount: number,
  totalCount: number,
  maxScore: number
): PlanningReadinessCheck => {
  const score = totalCount === 0 ? maxScore : Math.round((readyCount / totalCount) * maxScore);

  return PlanningReadinessCheckSchema.parse({
    code,
    label,
    maxScore,
    score
  });
};

const clampScore = (score: number): number => Math.max(0, Math.min(100, Math.round(score)));

const buildRisks = (
  input: PlanningReadinessInput,
  declinedAssignments: readonly PlanningAssignmentReadinessSignal[],
  blockedAcknowledgements: readonly PlanningRehearsalAcknowledgementReadinessInput[],
  needsPracticeAcknowledgements: readonly PlanningRehearsalAcknowledgementReadinessInput[],
  checks: readonly PlanningReadinessCheck[]
): readonly string[] => {
  const failedChecks = checks
    .filter((check) => check.score < check.maxScore)
    .map((check) => `${check.label} is incomplete.`);

  return [
    ...input.knownBlockers,
    ...(declinedAssignments.length > 0 ? ["One or more volunteers have declined."] : []),
    ...(blockedAcknowledgements.length > 0
      ? ["One or more rehearsal acknowledgements are blocked."]
      : []),
    ...(needsPracticeAcknowledgements.length > 0
      ? ["One or more volunteers need more rehearsal practice."]
      : []),
    ...failedChecks
  ];
};

const buildStrengths = (checks: readonly PlanningReadinessCheck[]): readonly string[] =>
  checks
    .filter((check) => check.score === check.maxScore)
    .map((check) => `${check.label} is complete.`);

const buildRecommendedActions = (
  input: PlanningReadinessInput,
  declinedAssignments: readonly PlanningAssignmentReadinessSignal[],
  blockedAcknowledgements: readonly PlanningRehearsalAcknowledgementReadinessInput[],
  needsPracticeAcknowledgements: readonly PlanningRehearsalAcknowledgementReadinessInput[],
  checks: readonly PlanningReadinessCheck[]
): readonly string[] => [
  ...(declinedAssignments.length > 0 ? ["Replace or follow up with declined volunteers."] : []),
  ...(blockedAcknowledgements.length > 0
    ? ["Resolve blocked rehearsal acknowledgements with assigned volunteers."]
    : []),
  ...(needsPracticeAcknowledgements.length > 0
    ? ["Schedule extra rehearsal support for volunteers who need practice."]
    : []),
  ...checks
    .filter((check) => check.score < check.maxScore)
    .map((check) => `Finish: ${check.label}.`),
  ...(input.knownBlockers.length > 0 ? ["Review known blockers with a worship leader."] : [])
];
