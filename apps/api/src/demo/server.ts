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
 * and seeds a handful of Charts plus a couple of Play track sets (each with an
 * arrangement, sections, and cues) under the demo tenant so the `charts` /
 * `chart` and `trackSets` / `trackSet` / `playSections` / `playCues` queries
 * return populated data. It exists only so the `apps/web` read surfaces can hit
 * a live endpoint for local screenshots; it is NOT a production server.
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

interface DemoSeedPlaySection {
  readonly clickEnabledDefault: boolean;
  readonly kind: "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "outro";
  readonly label: string;
  readonly lengthBars: number;
  readonly sectionId: string;
}

interface DemoSeedPlayCue {
  readonly action: "play" | "stop" | "jump" | "pad-change";
  readonly fireMode: "manual" | "auto";
  readonly label: string;
  readonly markerOffsetBeats: number;
  readonly padLayerRef?: string;
  readonly sectionId: string;
  readonly targetSectionRef?: string;
}

interface DemoSeedPlayTrackSet {
  readonly arrangementLabel: string;
  readonly arrangementRef: string;
  readonly cues: readonly DemoSeedPlayCue[];
  readonly defaultKey: string;
  readonly sections: readonly DemoSeedPlaySection[];
  readonly songRef: string;
  readonly tempoBpm: number;
  readonly title: string;
  readonly trackSetId: string;
}

/**
 * Demo Play seed. Mirrors `apps/web/src/play/sample-data.ts`
 * (Build My Life / Goodness of God) so the live Play screen matches what demo
 * mode renders: each track set has an arrangement, ordered sections, and a
 * couple of cues. Seeded through the real Play command service (arrangement ->
 * sections -> track set -> cues) so the live `trackSets` / `trackSet` /
 * `playSections` / `playCues` queries serve populated data.
 */
const DEMO_PLAY_TRACK_SETS: readonly DemoSeedPlayTrackSet[] = [
  {
    arrangementLabel: "Build My Life (Acoustic)",
    arrangementRef: "arr-build-my-life",
    cues: [
      {
        action: "play",
        fireMode: "manual",
        label: "Start intro pad",
        markerOffsetBeats: 0,
        sectionId: "section-bml-intro"
      },
      {
        action: "jump",
        fireMode: "manual",
        label: "Jump to chorus",
        markerOffsetBeats: 16,
        sectionId: "section-bml-verse",
        targetSectionRef: "section-bml-chorus"
      }
    ],
    defaultKey: "E",
    sections: [
      {
        clickEnabledDefault: true,
        kind: "intro",
        label: "Intro",
        lengthBars: 4,
        sectionId: "section-bml-intro"
      },
      {
        clickEnabledDefault: true,
        kind: "verse",
        label: "Verse 1",
        lengthBars: 8,
        sectionId: "section-bml-verse"
      },
      {
        clickEnabledDefault: true,
        kind: "chorus",
        label: "Chorus",
        lengthBars: 8,
        sectionId: "section-bml-chorus"
      }
    ],
    songRef: "song-build-my-life",
    tempoBpm: 68,
    title: "Build My Life",
    trackSetId: "track-set-build-my-life"
  },
  {
    arrangementLabel: "Goodness of God (Live)",
    arrangementRef: "arr-goodness-of-god",
    cues: [
      {
        action: "pad-change",
        fireMode: "auto",
        label: "Swell into bridge",
        markerOffsetBeats: 64,
        padLayerRef: "pad-gog-warm",
        sectionId: "section-gog-bridge"
      },
      {
        action: "stop",
        fireMode: "manual",
        label: "Stop after bridge",
        markerOffsetBeats: 128,
        sectionId: "section-gog-bridge"
      }
    ],
    defaultKey: "G",
    sections: [
      {
        clickEnabledDefault: false,
        kind: "verse",
        label: "Verse",
        lengthBars: 8,
        sectionId: "section-gog-verse"
      },
      {
        clickEnabledDefault: true,
        kind: "chorus",
        label: "Chorus",
        lengthBars: 8,
        sectionId: "section-gog-chorus"
      },
      {
        clickEnabledDefault: false,
        kind: "bridge",
        label: "Bridge",
        lengthBars: 16,
        sectionId: "section-gog-bridge"
      }
    ],
    songRef: "song-goodness-of-god",
    tempoBpm: 64,
    title: "Goodness of God",
    trackSetId: "track-set-goodness-of-god"
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
 * `seed()` that loads the demo Charts and Play track sets through the in-memory
 * command services. The caller decides when to `listen` and must `await seed()`
 * before serving.
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

    for (const trackSet of DEMO_PLAY_TRACK_SETS) {
      // Order matters in the in-memory Play service: the arrangement must exist
      // before its sections (sections validate their arrangementRef), and the
      // track set must exist before its cues (cues validate their trackSetId).
      // Explicit ids keep `trackSet(id:)` / `playSections` / `playCues` stable
      // and aligned with the web sample data.
      await play.commandService.savePlayArrangement({
        actor: demoActor,
        input: {
          arrangementRef: trackSet.arrangementRef,
          defaultKey: trackSet.defaultKey,
          label: trackSet.arrangementLabel,
          sectionOrder: trackSet.sections.map((section) => section.sectionId),
          songRef: trackSet.songRef,
          tempoBpm: trackSet.tempoBpm
        },
        requestId: `demo-seed-arrangement-${trackSet.arrangementRef}`
      });

      for (const section of trackSet.sections) {
        await play.commandService.savePlaySection({
          actor: demoActor,
          input: {
            arrangementRef: trackSet.arrangementRef,
            clickEnabledDefault: section.clickEnabledDefault,
            kind: section.kind,
            label: section.label,
            lengthBars: section.lengthBars,
            sectionId: section.sectionId
          },
          requestId: `demo-seed-section-${section.sectionId}`
        });
      }

      await play.commandService.saveTrackSet({
        actor: demoActor,
        input: {
          arrangementRef: trackSet.arrangementRef,
          defaultKey: trackSet.defaultKey,
          songRef: trackSet.songRef,
          tempoBpm: trackSet.tempoBpm,
          title: trackSet.title,
          trackRefs: [],
          trackSetId: trackSet.trackSetId
        },
        requestId: `demo-seed-track-set-${trackSet.trackSetId}`
      });

      for (const cue of trackSet.cues) {
        await play.commandService.addPlayCue({
          actor: demoActor,
          input: {
            action: cue.action,
            fireMode: cue.fireMode,
            label: cue.label,
            markerOffsetBeats: cue.markerOffsetBeats,
            sectionId: cue.sectionId,
            trackSetId: trackSet.trackSetId,
            ...(cue.padLayerRef !== undefined ? { padLayerRef: cue.padLayerRef } : {}),
            ...(cue.targetSectionRef !== undefined
              ? { targetSectionRef: cue.targetSectionRef }
              : {})
          },
          requestId: `demo-seed-cue-${trackSet.trackSetId}-${cue.label}`
        });
      }
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
