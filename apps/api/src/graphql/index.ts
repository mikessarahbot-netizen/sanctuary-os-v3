export const plannedGraphqlQueries = [
  "services",
  "service",
  "serviceTemplates",
  "serviceAssignments",
  "serviceReadiness",
  "songLibrary",
  "presentation",
  "presenterStyleTemplates",
  "presenterOutputState",
  "scripturePreview"
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
  "refreshReadinessScore",
  "createPresentationFromService",
  "updateSlideGroup",
  "updateSlide",
  "reorderSlides",
  "applyPresenterStyleTemplate",
  "importScriptureSlides",
  "setPresenterOutputState"
] as const;

export type PlannedGraphqlQuery = (typeof plannedGraphqlQueries)[number];
export type PlannedGraphqlMutation = (typeof plannedGraphqlMutations)[number];

export interface GraphqlSurface {
  readonly queries: readonly PlannedGraphqlQuery[];
  readonly mutations: readonly PlannedGraphqlMutation[];
}

export * from "./planning.js";
export * from "./presenter.js";
