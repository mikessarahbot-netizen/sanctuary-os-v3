/**
 * Public `@sanctuary-os/api/demo` entry.
 *
 * Re-exports the runnable DEMO composition + the Presenter GraphQL HTTP server
 * factory so an out-of-package consumer (notably the `apps/web` end-to-end
 * CONTRACT tests) can boot the REAL booted GraphQL server over the wire and drive
 * the REAL web clients against it WITHOUT deep-importing an unexported internal
 * path.
 *
 * Everything here is DEMO-ONLY and already shipped behind the `dev` /
 * `dev:persistent` scripts: the in-memory + persistent compositions, the fixed
 * `DemoAuthBoundary` (ignores the header value, resolves one tenant-scoped actor),
 * the deterministic clock, the seed routine, and the seeded demo constants (actor
 * id / tenant id / OBS connection + scenes). No real obs-websocket / comms / AI
 * dependency is reachable through any of it, and no secret/PII is exposed (see the
 * per-file headers in `compose.ts` / `server.ts` / `persistent-server.ts`).
 */
export { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
export {
  buildDemoSchema,
  createDemoClock,
  demoActor,
  seedDemoData,
  DEMO_ACTOR_ID,
  DEMO_OBS_CONNECTION,
  DEMO_OBS_PROGRAM_SCENE_REF,
  DEMO_OBS_SCENES,
  DEMO_TENANT_ID,
  type DemoAdapters
} from "./compose.js";
export {
  createDemoServer,
  DemoAuthBoundary,
  type CreateDemoServerOptions,
  type DemoServerComposition
} from "./server.js";
export {
  createPersistentDemoComposition,
  createPersistentDemoServer,
  resolveDemoDatabasePath,
  type CreatePersistentDemoCompositionDependencies,
  type DemoSeedOutcome,
  type NodeSqliteDatabaseLike,
  type PersistentDemoComposition,
  type PersistentDemoServer
} from "./persistent-server.js";
