import type { AuthBoundary, AuthenticatedActor } from "../auth/index.js";
import { createPresenterGraphqlHttpServer } from "../graphql/http-server.js";
import { createPresenterGraphqlSchema } from "../graphql/presenter-schema.js";
import { createInMemoryChartsServicesAdapter } from "../services/charts/in-memory.js";
import { createInMemoryCommunityServicesAdapter } from "../services/community/in-memory.js";
import { createInMemoryObsServicesAdapter } from "../services/obs/in-memory.js";
import { createFakeObsControlPort } from "../services/obs/fake-control-port.js";
import { createInMemoryPlayServicesAdapter } from "../services/play/in-memory.js";
import { createInMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
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

interface DemoSeedContactChannelRef {
  readonly channelRef: string;
  readonly consentStatus: "granted" | "denied" | "unknown";
  readonly kind: "sms" | "email" | "push" | "other";
}

interface DemoSeedMember {
  readonly contactChannelRefs: readonly DemoSeedContactChannelRef[];
  readonly displayName: string;
  readonly memberId: string;
  readonly status: "active" | "inactive" | "visitor" | "archived";
}

interface DemoSeedGroupMembership {
  readonly memberRef: string;
  readonly membershipId: string;
  readonly roleInGroup: "leader" | "co-leader" | "member" | "guest";
}

interface DemoSeedAttendance {
  readonly memberRef: string;
  readonly occasionRef: string;
  readonly status: "present" | "absent" | "excused";
}

interface DemoSeedCommunityGroup {
  // Hyphenated DOMAIN enum value — the seed calls the in-memory command service
  // directly (not via GraphQL), so the domain `GroupKindSchema` value is used,
  // not the underscored GraphQL SDL name.
  readonly kind: "small-group" | "serving-team" | "ministry" | "class" | "other";
  readonly groupId: string;
  readonly label: string;
  readonly leaderMemberRef?: string;
  readonly memberships: readonly DemoSeedGroupMembership[];
}

/**
 * Demo Community+ seed. Mirrors `apps/web/src/community/sample-data.ts`
 * (Hospitality Team / Tuesday Small Group, with members Anita / David / Maria /
 * Jon) so the live Community screen renders the same congregation structure demo
 * mode shows. Seeded through the real Community command service (members ->
 * groups -> memberships -> member attendance -> recompute engagement) so the live
 * `communityGroups` / `communityGroup` / `groupMemberships` / `members` /
 * `engagementSummaries` queries serve populated data.
 *
 * PRIVACY: every seeded value is PII-SAFE. Members carry a `displayName` (a
 * directory name) + `status` and opaque `contactChannelRefs` — each ref is a
 * vault `channelRef` token (e.g. `channel-anita-sms`), a `kind`, and a
 * `consentStatus`, NEVER a phone/email/address value. The Community+ schemas
 * (`apps/api/src/domain/community/schemas.ts`) `.strict()`-reject any raw contact
 * key, so a contact value cannot be seeded even by mistake.
 */
const DEMO_COMMUNITY_MEMBERS: readonly DemoSeedMember[] = [
  {
    contactChannelRefs: [
      { channelRef: "channel-anita-sms", consentStatus: "granted", kind: "sms" },
      { channelRef: "channel-anita-email", consentStatus: "granted", kind: "email" }
    ],
    displayName: "Anita Bello",
    memberId: "member-anita",
    status: "active"
  },
  {
    contactChannelRefs: [
      { channelRef: "channel-david-sms", consentStatus: "denied", kind: "sms" }
    ],
    displayName: "David Okoye",
    memberId: "member-david",
    status: "active"
  },
  {
    contactChannelRefs: [
      { channelRef: "channel-maria-email", consentStatus: "unknown", kind: "email" }
    ],
    displayName: "Maria Santos",
    memberId: "member-maria",
    status: "visitor"
  },
  {
    contactChannelRefs: [
      { channelRef: "channel-jon-push", consentStatus: "granted", kind: "push" }
    ],
    displayName: "Jon Pierce",
    memberId: "member-jon",
    status: "active"
  }
];

const DEMO_COMMUNITY_GROUPS: readonly DemoSeedCommunityGroup[] = [
  {
    groupId: "group-hospitality",
    kind: "serving-team",
    label: "Hospitality Team",
    leaderMemberRef: "member-anita",
    memberships: [
      {
        memberRef: "member-anita",
        membershipId: "membership-hospitality-anita",
        roleInGroup: "leader"
      },
      {
        memberRef: "member-david",
        membershipId: "membership-hospitality-david",
        roleInGroup: "member"
      },
      {
        memberRef: "member-maria",
        membershipId: "membership-hospitality-maria",
        roleInGroup: "guest"
      }
    ]
  },
  {
    groupId: "group-tuesday",
    kind: "small-group",
    label: "Tuesday Small Group",
    leaderMemberRef: "member-jon",
    memberships: [
      {
        memberRef: "member-jon",
        membershipId: "membership-tuesday-jon",
        roleInGroup: "leader"
      },
      {
        memberRef: "member-anita",
        membershipId: "membership-tuesday-anita",
        roleInGroup: "co-leader"
      }
    ]
  }
];

/**
 * Member attendance rows used to populate `engagementSummaries` via
 * `recomputeEngagementSummaries`. Each `present` row builds a member's attendance
 * streak; combined with active memberships (serving count) the recompute produces
 * a non-empty, PII-free summary per member. `recordedAt` is set by the demo clock
 * at seed time (mid-2026), which sits inside the recompute window below.
 */
const DEMO_COMMUNITY_ATTENDANCE: readonly DemoSeedAttendance[] = [
  { memberRef: "member-anita", occasionRef: "occasion-2026-06-07", status: "present" },
  { memberRef: "member-anita", occasionRef: "occasion-2026-06-14", status: "present" },
  { memberRef: "member-jon", occasionRef: "occasion-2026-06-14", status: "present" },
  { memberRef: "member-david", occasionRef: "occasion-2026-06-14", status: "present" }
];

const DEMO_ENGAGEMENT_WINDOW = {
  windowEnd: "2026-12-31T23:59:59.000Z",
  windowStart: "2026-01-01T00:00:00.000Z"
} as const;

interface DemoSeedObsScene {
  readonly displayName: string;
  readonly obsSceneRef: string;
}

/**
 * Demo OBS seed. Mirrors `apps/web/src/obs/sample-data.ts` (Worship / Sermon /
 * Announcements, with Worship the current program scene) so the live OBS screen
 * renders the same scene catalog demo mode shows.
 *
 * The catalog is loaded into a FAKE `ObsControlPort` (`createFakeObsControlPort`)
 * — there is NO real obs-websocket dependency. The demo seed saves one
 * `ObsConnectionProfile` (an opaque `connectionRef` vault handle — NEVER a host /
 * port / password / stream key) and then calls the real `refreshObsCatalog`
 * command, which reads the fake port and reconciles the durable scene /
 * program-scene / stream / recording snapshot so the live `obsScenes` /
 * `obsStreamState` / `obsRecordingState` / `obsActionLog` queries serve populated
 * data and the request -> confirm -> dispatch gate runs against it.
 *
 * The `connectionRef` is the only place a connection is named, and it is an opaque
 * `vault://` token, so no secret is ever seeded or rendered.
 */
const DEMO_OBS_CONNECTION = {
  connectionProfileId: "obs-connection-sanctuary",
  connectionRef: "vault://obs/demo-sanctuary",
  label: "Sanctuary OBS"
} as const;

const DEMO_OBS_SCENES: readonly DemoSeedObsScene[] = [
  { displayName: "Worship", obsSceneRef: "scene-worship" },
  { displayName: "Sermon", obsSceneRef: "scene-sermon" },
  { displayName: "Announcements", obsSceneRef: "scene-announcements" }
];

// Worship is on the program output when the demo boots; the operator drives the
// gated switch to Sermon / Announcements for the live screenshot.
const DEMO_OBS_PROGRAM_SCENE_REF = "scene-worship";

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

    // Community+: members first (so memberships + engagement reference existing
    // members), then groups, then memberships, then member attendance, then a
    // single engagement recompute over the window. Every save goes through the
    // real command service with explicit ids so `communityGroup(id:)` /
    // `groupMemberships(groupId:)` / `member(id:)` stay stable and aligned with
    // the web sample data. All seeded values are PII-safe (display names + opaque
    // contact refs + consent only — never a contact value).
    for (const member of DEMO_COMMUNITY_MEMBERS) {
      await community.commandService.saveMember({
        actor: demoActor,
        input: {
          contactChannelRefs: [...member.contactChannelRefs],
          customFieldValues: [],
          displayName: member.displayName,
          memberId: member.memberId,
          segmentRefs: [],
          status: member.status
        },
        requestId: `demo-seed-member-${member.memberId}`
      });
    }

    for (const group of DEMO_COMMUNITY_GROUPS) {
      await community.commandService.saveCommunityGroup({
        actor: demoActor,
        input: {
          archived: false,
          groupId: group.groupId,
          kind: group.kind,
          label: group.label,
          ...(group.leaderMemberRef !== undefined
            ? { leaderMemberRef: group.leaderMemberRef }
            : {})
        },
        requestId: `demo-seed-group-${group.groupId}`
      });

      for (const membership of group.memberships) {
        await community.commandService.setGroupMembership({
          actor: demoActor,
          input: {
            active: true,
            groupId: group.groupId,
            memberRef: membership.memberRef,
            membershipId: membership.membershipId,
            roleInGroup: membership.roleInGroup
          },
          requestId: `demo-seed-membership-${membership.membershipId}`
        });
      }
    }

    for (const record of DEMO_COMMUNITY_ATTENDANCE) {
      // Member attendance row: memberRef + status, never a headcount (the schema
      // rejects a headcount on a member row).
      await community.commandService.recordAttendance({
        actor: demoActor,
        input: {
          memberRef: record.memberRef,
          occasionRef: record.occasionRef,
          status: record.status
        },
        requestId: `demo-seed-attendance-${record.memberRef}-${record.occasionRef}`
      });
    }

    // Derive the PII-free engagement summaries (refs + counts) over the window so
    // the live `engagementSummaries` query is populated.
    await community.commandService.recomputeEngagementSummaries({
      actor: demoActor,
      input: {
        windowEnd: DEMO_ENGAGEMENT_WINDOW.windowEnd,
        windowStart: DEMO_ENGAGEMENT_WINDOW.windowStart
      },
      requestId: "demo-seed-engagement-recompute"
    });

    // OBS: save the connection profile (opaque connectionRef — NO secret), then
    // run the real `refreshObsCatalog` command. The refresh reads the FAKE control
    // port (loaded above with the Worship / Sermon / Announcements catalog +
    // Worship as the program scene + active stream) and reconciles the durable
    // snapshot, so the live `obsConnectionProfiles` / `obsScenes` /
    // `obsStreamState` / `obsRecordingState` queries serve populated data and the
    // operator can drive the request -> confirm -> dispatch scene-switch gate.
    await obs.commandService.saveObsConnectionProfile({
      actor: demoActor,
      input: {
        connectionProfileId: DEMO_OBS_CONNECTION.connectionProfileId,
        connectionRef: DEMO_OBS_CONNECTION.connectionRef,
        label: DEMO_OBS_CONNECTION.label
      },
      requestId: `demo-seed-obs-connection-${DEMO_OBS_CONNECTION.connectionProfileId}`
    });

    await obs.commandService.refreshObsCatalog({
      actor: demoActor,
      input: { connectionProfileId: DEMO_OBS_CONNECTION.connectionProfileId },
      requestId: `demo-seed-obs-refresh-${DEMO_OBS_CONNECTION.connectionProfileId}`
    });
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
