import { z } from "zod";

const NonEmptyStringSchema = z.string().min(1);

export const PlanningAssignmentStatusSchema = z.enum(["pending", "confirmed", "declined"]);

export const PlanningRequiredRoleSchema = z.object({
  displayName: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema
});

export const PlanningAssignmentReadinessSignalSchema = z.object({
  assignmentId: NonEmptyStringSchema,
  roleId: NonEmptyStringSchema,
  status: PlanningAssignmentStatusSchema
});

export const PlanningServiceItemReadinessSignalSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  hasAttachedSong: z.boolean().default(false),
  hasChart: z.boolean().default(false),
  hasCurrentCcliLog: z.boolean().default(false),
  hasVisibleRehearsalAsset: z.boolean().default(false),
  requiresCcliLog: z.boolean().default(false),
  serviceItemId: NonEmptyStringSchema,
  title: NonEmptyStringSchema
});

export const PlanningReadinessInputSchema = z.object({
  assignments: z.array(PlanningAssignmentReadinessSignalSchema),
  knownBlockers: z.array(NonEmptyStringSchema).default([]),
  requiredRoles: z.array(PlanningRequiredRoleSchema),
  serviceId: NonEmptyStringSchema,
  serviceItems: z.array(PlanningServiceItemReadinessSignalSchema),
  tenantId: NonEmptyStringSchema
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
export type PlanningReadinessBand = z.infer<typeof PlanningReadinessBandSchema>;
export type PlanningReadinessCheck = z.infer<typeof PlanningReadinessCheckSchema>;
export type PlanningReadinessInput = z.infer<typeof PlanningReadinessInputSchema>;
export type PlanningReadinessResult = z.infer<typeof PlanningReadinessResultSchema>;
export type PlanningRequiredRole = z.infer<typeof PlanningRequiredRoleSchema>;
export type PlanningServiceItemReadinessSignal = z.infer<
  typeof PlanningServiceItemReadinessSignalSchema
>;

const READINESS_WEIGHTS = {
  ccliLogging: 10,
  confirmedAssignments: 20,
  requiredRoles: 25,
  rehearsalVisibility: 15,
  servicePlan: 15,
  songAssets: 15
} as const;

export const calculatePlanningReadiness = (
  rawInput: PlanningReadinessInput
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
  const ccliRequiredItems = input.serviceItems.filter((item) => item.requiresCcliLog);
  const ccliCurrentItems = ccliRequiredItems.filter((item) => item.hasCurrentCcliLog);

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
      "ccli-logging",
      "CCLI logging current",
      ccliCurrentItems.length,
      ccliRequiredItems.length,
      READINESS_WEIGHTS.ccliLogging
    )
  ];

  const rawScore = checks.reduce((total, check) => total + check.score, 0);
  const blockerPenalty = Math.min(input.knownBlockers.length * 10, 30);
  const readinessScore = clampScore(rawScore - blockerPenalty);
  const risks = buildRisks(input, declinedAssignments, checks);
  const strengths = buildStrengths(checks);
  const recommendedActions = buildRecommendedActions(input, declinedAssignments, checks);

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
  checks: readonly PlanningReadinessCheck[]
): readonly string[] => {
  const failedChecks = checks
    .filter((check) => check.score < check.maxScore)
    .map((check) => `${check.label} is incomplete.`);

  return [
    ...input.knownBlockers,
    ...(declinedAssignments.length > 0 ? ["One or more volunteers have declined."] : []),
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
  checks: readonly PlanningReadinessCheck[]
): readonly string[] => [
  ...(declinedAssignments.length > 0 ? ["Replace or follow up with declined volunteers."] : []),
  ...checks
    .filter((check) => check.score < check.maxScore)
    .map((check) => `Finish: ${check.label}.`),
  ...(input.knownBlockers.length > 0 ? ["Review known blockers with a worship leader."] : [])
];
