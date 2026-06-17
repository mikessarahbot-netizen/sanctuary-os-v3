import type { ChurchContextBuilder } from "../context/index.js";
import type { EventPublisher } from "../events/index.js";
import type { JobDispatcher } from "../jobs/index.js";

export interface ApiServiceDependencies {
  readonly churchContextBuilder: ChurchContextBuilder;
  readonly eventPublisher: EventPublisher;
  readonly jobDispatcher: JobDispatcher;
}

export interface ApiServiceRegistry {
  readonly dependencies: ApiServiceDependencies;
}

export * from "./planning/index.js";
export * from "./presenter/index.js";
