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
  "outputTargets",
  "charts",
  "chart",
  "chartsForSong",
  "chartArrangements",
  "musicianChartPreference",
  "chartAnnotations"
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
  "setOutputTarget",
  "saveChart",
  "updateChartSource",
  "saveChartArrangement",
  "setMusicianChartPreference",
  "addChartAnnotation",
  "updateChartAnnotation",
  "removeChartAnnotation"
] as const;

export type PlannedGraphqlQuery = (typeof plannedGraphqlQueries)[number];
export type PlannedGraphqlMutation = (typeof plannedGraphqlMutations)[number];

export interface GraphqlSurface {
  readonly queries: readonly PlannedGraphqlQuery[];
  readonly mutations: readonly PlannedGraphqlMutation[];
}

export * from "./charts.js";
export * from "./http-server.js";
export * from "./planning.js";
export * from "./presenter.js";
export * from "./presenter-schema.js";
export * from "./transport.js";
