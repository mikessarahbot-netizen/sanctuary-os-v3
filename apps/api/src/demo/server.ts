import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
import { createInMemoryChartsServicesAdapter } from "../services/charts/in-memory.js";
import { createInMemoryCommunityServicesAdapter } from "../services/community/in-memory.js";
import { createInMemoryObsServicesAdapter } from "../services/obs/in-memory.js";
import { createFakeObsControlPort } from "../services/obs/fake-control-port.js";
import { createInMemoryPlayServicesAdapter } from "../services/play/in-memory.js";
import { createInMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
import {
  buildDemoSchema,
  createDemoClock,
  demoActor,
  seedDemoData,
  DEMO_OBS_PROGRAM_SCENE_REF,
  DEMO_OBS_SCENES
} from "./compose.js";
import type { Server } from "node:http";

/**
 * Runnable local DEMO GraphQL server for the API.
 *
 * This composes the full executable schema with every module's in-memory
 * service (deterministic clock + id generators; the OBS fake is the adapter's
 * built-in default), resolves every request to one fixed demo actor, and seeds a
 * handful of Charts, a couple of Play track sets (each with an arrangement,
 * sections, and cues), plus a small Community+ congregation structure (two groups
 * with members + memberships + member attendance + derived engagement summaries)
 * under the demo tenant so the `charts` / `chart`, `trackSets` / `trackSet` /
 * `playSections` / `playCues`, and `communityGroups` / `communityGroup` /
 * `groupMemberships` / `members` / `engagementSummaries` queries return populated
 * data, plus an OBS connection + scene catalog (loaded into a FAKE control port —
 * no real obs-websocket) so the `obsConnectionProfiles` / `obsScenes` /
 * `obsStreamState` / `obsRecordingState` / `obsActionLog` queries and the
 * request -> confirm -> dispatch scene-switch gate serve live data. It exists only
 * so the `apps/web` read surfaces can hit a live endpoint for local screenshots;
 * it is NOT a production server. The seeded Community+ data is PII-safe (display
 * names + opaque contact refs + consent only); the OBS connection carries only an
 * opaque `connectionRef` (no host / port / password / stream key).
 *
 * This in-memory variant is EPHEMERAL: every boot starts empty and re-seeds, so
 * no data survives a restart. For a durable variant over a real on-disk
 * `node:sqlite` database (charts/play/community/obs), see `persistent-server.ts`,
 * which reuses the same `buildDemoSchema` + `seedDemoData` from `compose.ts`.
 *
 * The demo auth is intentionally trivial (see `DemoAuthBoundary`): it ignores
 * the `Authorization` header value and always returns the same actor. Never
 * wire this into a real deployment — there are no real secrets and no real
 * identity check. The web app sends a constant non-empty bearer token only to
 * satisfy the transport's "auth header required" guard.
 */

/**
 * DEMO-ONLY auth boundary. Resolves every request to the single fixed demo
 * actor regardless of the header value, so the web app needs no real auth. The
 * transport still requires a non-empty `Authorization` header, so the web
 * client sends a constant placeholder token.
 */
export class DemoAuthBoundary implements AuthBoundary {
  public resolveActor(authHeader: string): Promise<AuthenticatedActor> {
    // Demo only: the header is required by the transport but its value is
    // ignored; every caller resolves to the same fixed actor.
    void authHeader;

    return Promise.resolve(demoActor);
  }
}

export interface DemoServerComposition {
  readonly authBoundary: AuthBoundary;
  readonly seed: () => Promise<void>;
  readonly server: Server;
}

export interface CreateDemoServerOptions {
  readonly path?: string;
}

/**
 * Compose the demo server: build the schema with all modules wired to in-memory
 * services, create the Node http server on the configured path, and return a
 * `seed()` that loads the demo Charts, Play track sets, Community+ structure, and
 * the OBS connection + scene catalog through the in-memory command services. The
 * caller decides when to `listen` and must `await seed()` before serving.
 */
export const createDemoServer = (
  options: CreateDemoServerOptions = {}
): DemoServerComposition => {
  const clock = createDemoClock();
  const charts = createInMemoryChartsServicesAdapter({ clock });
  const presenter = createInMemoryPresenterServicesAdapter({ clock });
  const play = createInMemoryPlayServicesAdapter({ clock });
  // Pre-load the FAKE OBS control port with the demo scene catalog + current
  // program scene (no real obs-websocket). `refreshObsCatalog` reads from this
  // fake at seed time to populate the durable snapshot, and `dispatchObsAction`
  // mutates it through the same fake when the operator confirms a scene switch.
  const obsControlPort = createFakeObsControlPort({
    currentProgramSceneRef: DEMO_OBS_PROGRAM_SCENE_REF,
    recordingStatus: "inactive",
    scenes: DEMO_OBS_SCENES.map((scene) => ({ ...scene })),
    streamStatus: "active"
  });
  const obs = createInMemoryObsServicesAdapter({
    clock,
    controlPort: obsControlPort.port
  });
  const community = createInMemoryCommunityServicesAdapter({ clock });

  const schema = buildDemoSchema({ charts, community, obs, play, presenter });

  const authBoundary = new DemoAuthBoundary();
  const server = createPresenterGraphqlHttpServer({
    authBoundary,
    schema,
    ...(options.path !== undefined ? { path: options.path } : {})
  });

  const seed = (): Promise<void> =>
    seedDemoData({ charts, community, obs, play, presenter });

  return { authBoundary, seed, server };
};

const DEFAULT_PORT = 4000;

const resolvePort = (rawPort: string | undefined): number => {
  if (rawPort === undefined || rawPort.length === 0) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_PORT;
};

/**
 * Module entry: seed the demo data, then listen on `PORT` (default 4000) and log
 * the GraphQL URL. Run with `pnpm --filter @sanctuary-os/api dev`.
 */
const main = async (): Promise<void> => {
  const { seed, server } = createDemoServer();
  await seed();

  const port = resolvePort(process.env["PORT"]);
  const host = "127.0.0.1";

  server.listen(port, host, () => {
    // Demo server: surface the URL so the operator knows where to point the web app.
    console.log(`Demo GraphQL API listening at http://${host}:${String(port)}/graphql`);
  });
};

// Run only when executed directly (e.g. `tsx src/demo/server.ts`), not on import
// from the gate test. `import.meta.url` is the file URL; `process.argv[1]` is the
// invoked script path.
const invokedPath = process.argv[1];

if (invokedPath !== undefined && import.meta.url === `file://${invokedPath}`) {
  void main();
}
