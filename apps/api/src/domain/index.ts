export const plannedApiAggregates = [
  "service",
  "serviceItem",
  "assignment",
  "rehearsalTracking",
  "ccliUsageLog"
] as const;

export type PlannedApiAggregate = (typeof plannedApiAggregates)[number];

export interface DomainRuleResult {
  readonly passed: boolean;
  readonly code: string;
  readonly message: string;
}

export * from "./planning/index.js";
export * from "./presenter/index.js";
