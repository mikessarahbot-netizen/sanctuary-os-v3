export const plannedGraphqlQueries = [
  "services",
  "service",
  "serviceTemplates",
  "serviceAssignments",
  "serviceReadiness",
  "songLibrary",
  "presentations",
  "presentation",
  "presentationForService",
  "presenterThemes",
  "outputTargets"
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
  "updatePresentation",
  "addSlide",
  "updateSlide",
  "reorderSlides",
  "removeSlide",
  "applyPresenterTheme",
  "setOutputTarget"
] as const;

export type PlannedGraphqlQuery = (typeof plannedGraphqlQueries)[number];
export type PlannedGraphqlMutation = (typeof plannedGraphqlMutations)[number];

export interface GraphqlSurface {
  readonly queries: readonly PlannedGraphqlQuery[];
  readonly mutations: readonly PlannedGraphqlMutation[];
}

export * from "./planning.js";
export * from "./presenter.js";
