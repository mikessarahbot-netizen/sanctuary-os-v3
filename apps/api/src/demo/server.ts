import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
import { createPresenterGraphqlSchema } from "../graphql/presenter-schema.js";
import { createInMemoryChartsServicesAdapter } from "../services/charts/in-memory.js";
import { createInMemoryCommunityServicesAdapter } from "../services/community/in-memory.js";
import { createInMemoryObsServicesAdapter } from "../services/obs/in-memory.js";
import { createInMemoryPlayServicesAdapter } from "../services/play/in-memory.js";
import { createInMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
import type { Server } from "node:http";

/**
 * Runnable local DEMO GraphQL server for the API.
 *
 * This composes the full executable schema with every module's in-memory
 * service (deterministic clock + id generators; the OBS/Community fakes are the
 * adapters' built-in defaults), resolves every request to one fixed demo actor,
 * and seeds a handful of Charts under the demo tenant so a `charts` / `chart`
 * query returns populated data. It exists only so the `apps/web` Charts app can
 * hit a live endpoint for local screenshots; it is NOT a production server.
 *
 * The demo auth is intentionally trivial (see `DemoAuthBoundary`): it ignores
 * the `Authorization` header value and always returns the same actor. Never
 * wire this into a real deployment — there are no real secrets and no real
 * identity check. The web app sends a constant non-empty bearer token only to
 * satisfy the transport's "auth header required" guard.
 */
const DEMO_TENANT_ID = "tenant-demo";
const DEMO_ACTOR_ID = "demo-actor";

/**
 * Roles granted to the demo actor. The union covers every resolver's role gate
 * across the wired modules (presenter/charts/play/community/obs command + query
 * paths) so the demo never trips an authorization error.
 */
const DEMO_ACTOR_ROLES = [
  "super_admin",
  "church_admin",
  "worship_leader",
  "planner",
  "musician"
] as const;

const demoActor: AuthenticatedActor = {
  actorId: DEMO_ACTOR_ID,
  roles: [...DEMO_ACTOR_ROLES],
  tenantId: DEMO_TENANT_ID
};

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

/**
 * Deterministic clock for reproducible seeded timestamps. The seed below passes
 * explicit per-chart timestamps, so this only governs any later mutations made
 * through the live app during a demo session.
 */
const createDemoClock = (): (() => string) => {
  let tick = 0;

  return (): string => {
    const base = Date.parse("2026-06-18T00:00:00.000Z");
    const value = new Date(base + tick * 1000).toISOString();
    tick += 1;

    return value;
  };
};

interface DemoSeedChart {
  readonly chartId: string;
  readonly chordProSource: string;
  readonly defaultKey: string;
  readonly songRef: string;
  readonly title: string;
}

/**
 * Demo Charts seed. Mirrors `apps/web/src/charts/sample-data.ts`
 * (Amazing Grace / How Great Thou Art / Cornerstone) with real ChordPro so the
 * live Charts screen matches what demo mode renders.
 */
const DEMO_CHARTS: readonly DemoSeedChart[] = [
  {
    chartId: "chart-amazing-grace",
    chordProSource: [
      "{title: Amazing Grace}",
      "{key: G}",
      "",
      "{start_of_verse}",
      "[G]Amazing [G7]grace how [C]sweet the [G]sound",
      "That [G]saved a [Em]wretch like [D]me",
      "{end_of_verse}"
    ].join("\n"),
    defaultKey: "G",
    songRef: "song-amazing-grace",
    title: "Amazing Grace"
  },
  {
    chartId: "chart-how-great-thou-art",
    chordProSource: [
      "{title: How Great Thou Art}",
      "{key: D}",
      "",
      "{start_of_chorus}",
      "Then [D]sings my [G]soul, my [D]Saviour God to [A]thee",
      "How [D]great thou [G]art, how [A]great thou [D]art",
      "{end_of_chorus}"
    ].join("\n"),
    defaultKey: "D",
    songRef: "song-how-great-thou-art",
    title: "How Great Thou Art"
  },
  {
    chartId: "chart-cornerstone",
    chordProSource: [
      "{title: Cornerstone}",
      "{key: C}",
      "",
      "{start_of_chorus}",
      "Christ a[C]lone, corner[G]stone",
      "Weak made [Am]strong in the [F]Saviour's love",
      "{end_of_chorus}"
    ].join("\n"),
    defaultKey: "C",
    songRef: "song-cornerstone",
    title: "Cornerstone"
  }
];

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
 * `seed()` that loads the demo Charts through the in-memory command service.
 * The caller decides when to `listen` and must `await seed()` before serving.
 */
export const createDemoServer = (
  options: CreateDemoServerOptions = {}
): DemoServerComposition => {
  const clock = createDemoClock();
  const charts = createInMemoryChartsServicesAdapter({ clock });
  const presenter = createInMemoryPresenterServicesAdapter({ clock });
  const play = createInMemoryPlayServicesAdapter({ clock });
  const obs = createInMemoryObsServicesAdapter({ clock });
  const community = createInMemoryCommunityServicesAdapter({ clock });

  const schema = createPresenterGraphqlSchema({
    charts: {
      chartsCommandService: charts.commandService,
      chartsQueryService: charts.queryService
    },
    community: {
      communityCommandService: community.commandService,
      communityQueryService: community.queryService
    },
    obs: {
      obsCommandService: obs.commandService,
      obsQueryService: obs.queryService
    },
    play: {
      playCommandService: play.commandService,
      playQueryService: play.queryService
    },
    presenterCommandService: presenter.commandService,
    presenterQueryService: presenter.queryService
  });

  const authBoundary = new DemoAuthBoundary();
  const server = createPresenterGraphqlHttpServer({
    authBoundary,
    schema,
    ...(options.path !== undefined ? { path: options.path } : {})
  });

  const seed = async (): Promise<void> => {
    let seedTimestampTick = 0;

    for (const chart of DEMO_CHARTS) {
      const timestamp = new Date(
        Date.parse("2026-01-04T09:00:00.000Z") + seedTimestampTick * 86_400_000
      ).toISOString();
      seedTimestampTick += 1;

      // Seed through the real command path so the live `charts`/`chart` query
      // serves data the same way a future write would. Explicit chartIds keep
      // `chart(id:)` stable and aligned with the web sample data.
      await charts.commandService.saveChart({
        actor: demoActor,
        input: {
          chartId: chart.chartId,
          chordProSource: chart.chordProSource,
          defaultKey: chart.defaultKey,
          songRef: chart.songRef,
          title: chart.title
        },
        requestId: `demo-seed-${chart.chartId}-${timestamp}`
      });
    }
  };

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
