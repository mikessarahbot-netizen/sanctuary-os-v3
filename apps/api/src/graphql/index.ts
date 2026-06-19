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
  "chartAnnotations",
  "trackSets",
  "trackSet",
  "trackSetsForSong",
  "playArrangements",
  "playSections",
  "playCues",
  "padLayers",
  "playbackState",
  "resolvedPlaySequence"
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
  "removeChartAnnotation",
  "saveTrackSet",
  "updateTrackSetMembers",
  "savePlayArrangement",
  "savePlaySection",
  "reorderPlaySections",
  "addPlayCue",
  "updatePlayCue",
  "removePlayCue",
  "savePadLayer",
  "setPlaybackState"
] as const;

export type PlannedGraphqlQuery = (typeof plannedGraphqlQueries)[number];
export type PlannedGraphqlMutation = (typeof plannedGraphqlMutations)[number];

export interface GraphqlSurface {
  readonly queries: readonly PlannedGraphqlQuery[];
  readonly mutations: readonly PlannedGraphqlMutation[];
}

export * from "./charts.js";
export * from "./community.js";
export * from "./http-server.js";
export * from "./obs.js";
export * from "./planning.js";
export * from "./play.js";
export * from "./presenter.js";
export * from "./presenter-schema.js";
export * from "./transport.js";
