export const plannedGraphqlQueries = [
  "services",
  "service",
  "serviceTemplates",
  "serviceAssignments",
  "serviceReadiness",
  "songLibrary"
] as const;

export const plannedGraphqlMutations = [
  "createService",
  "updateService",
  "duplicateServiceFromTemplate",
  "addServiceItem",
  "updateServiceItem",
  "reorderServiceItems",
  "assignVolunteer",
  "updateAssignmentStatus",
  "generateSetlist",
  "refreshReadinessScore"
] as const;

export type PlannedGraphqlQuery = (typeof plannedGraphqlQueries)[number];
export type PlannedGraphqlMutation = (typeof plannedGraphqlMutations)[number];

export interface GraphqlSurface {
  readonly queries: readonly PlannedGraphqlQuery[];
  readonly mutations: readonly PlannedGraphqlMutation[];
}
