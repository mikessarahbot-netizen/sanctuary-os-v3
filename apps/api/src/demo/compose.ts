import type { AuthenticatedActor } from "../auth/index.js";
import { createPresenterGraphqlSchema } from "../graphql/presenter-schema.js";
import type { InMemoryChartsServicesAdapter } from "../services/charts/in-memory.js";
import type { InMemoryCommunityServicesAdapter } from "../services/community/in-memory.js";
import type { InMemoryObsServicesAdapter } from "../services/obs/in-memory.js";
import type { InMemoryPlayServicesAdapter } from "../services/play/in-memory.js";
import type { InMemoryPresenterServicesAdapter } from "../services/presenter/in-memory.js";
import type { GraphQLSchema } from "graphql";

/**
 * Shared demo composition: the GraphQL-schema wiring and the data-seeding routine
 * that BOTH the in-memory demo server (`server.ts`) and the persistent demo
 * server (`persistent-server.ts`) reuse.
 *
 * The seed runs entirely through each module's command-service interface (the
 * same `commandService` shape the in-memory and the persistence-backed adapters
 * both expose), so the identical routine populates either backing store. The
 * persistent server seeds ONLY when the store is empty (so a reboot preserves
 * existing data); the in-memory server always seeds a fresh process.
 *
 * Every seeded value is PII-safe: Community+ members carry a `displayName`,
 * `status`, and opaque `contactChannelRefs` (a vault `channelRef` token + `kind`
 * + `consentStatus`, NEVER a contact value); the OBS connection carries only an
 * opaque `connectionRef` (no host / port / password / stream key).
 */
export const DEMO_TENANT_ID = "tenant-demo";
export const DEMO_ACTOR_ID = "demo-actor";

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

export const demoActor: AuthenticatedActor = {
  actorId: DEMO_ACTOR_ID,
  roles: [...DEMO_ACTOR_ROLES],
  tenantId: DEMO_TENANT_ID
};

/**
 * Deterministic clock for reproducible seeded timestamps. The seed below passes
 * explicit per-chart timestamps, so this only governs any later mutations made
 * through the live app during a demo session.
 */
export const createDemoClock = (): (() => string) => {
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

interface DemoSeedPlaybackState {
  readonly activeSectionRef: string;
  readonly clickEnabled: boolean;
  readonly positionBeats: number;
  readonly transportStatus: "stopped" | "playing" | "paused";
}

interface DemoSeedPlayTrackSet {
  readonly arrangementLabel: string;
  readonly arrangementRef: string;
  readonly cues: readonly DemoSeedPlayCue[];
  readonly defaultKey: string;
  readonly initialPlaybackState?: DemoSeedPlaybackState;
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
    initialPlaybackState: {
      activeSectionRef: "section-bml-intro",
      clickEnabled: true,
      positionBeats: 0,
      transportStatus: "stopped"
    },
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
export const DEMO_OBS_CONNECTION = {
  connectionProfileId: "obs-connection-sanctuary",
  connectionRef: "vault://obs/demo-sanctuary",
  label: "Sanctuary OBS"
} as const;

export const DEMO_OBS_SCENES: readonly DemoSeedObsScene[] = [
  { displayName: "Worship", obsSceneRef: "scene-worship" },
  { displayName: "Sermon", obsSceneRef: "scene-sermon" },
  { displayName: "Announcements", obsSceneRef: "scene-announcements" }
];

// Worship is on the program output when the demo boots; the operator drives the
// gated switch to Sermon / Announcements for the live screenshot.
export const DEMO_OBS_PROGRAM_SCENE_REF = "scene-worship";

/**
 * The five module service adapters the demo schema wiring + seed consume. Each
 * carries the `commandService` / `queryService` pair the GraphQL resolvers call;
 * the in-memory adapters and the persistence-backed adapters both satisfy these
 * shapes, so the same `buildDemoSchema` + `seedDemoData` drive either backing
 * store. The four web-surfaced modules (charts/play/community/obs) are the
 * persistence target; presenter is in-memory in both variants.
 */
export interface DemoAdapters {
  readonly charts: Pick<InMemoryChartsServicesAdapter, "commandService" | "queryService">;
  readonly community: Pick<
    InMemoryCommunityServicesAdapter,
    "commandService" | "queryService"
  >;
  readonly obs: Pick<InMemoryObsServicesAdapter, "commandService" | "queryService">;
  readonly play: Pick<InMemoryPlayServicesAdapter, "commandService" | "queryService">;
  readonly presenter: Pick<
    InMemoryPresenterServicesAdapter,
    "commandService" | "queryService"
  >;
}

/**
 * Wire the full executable schema from the five module adapters. Identical for
 * the in-memory and the persistent demo server — only the adapters' backing store
 * differs.
 */
export const buildDemoSchema = (adapters: DemoAdapters): GraphQLSchema =>
  createPresenterGraphqlSchema({
    charts: {
      chartsCommandService: adapters.charts.commandService,
      chartsQueryService: adapters.charts.queryService
    },
    community: {
      communityCommandService: adapters.community.commandService,
      communityQueryService: adapters.community.queryService
    },
    obs: {
      obsCommandService: adapters.obs.commandService,
      obsQueryService: adapters.obs.queryService
    },
    play: {
      playCommandService: adapters.play.commandService,
      playQueryService: adapters.play.queryService
    },
    presenterCommandService: adapters.presenter.commandService,
    presenterQueryService: adapters.presenter.queryService
  });

/**
 * Seed the demo Charts, Play track sets, Community+ structure, and the OBS
 * connection + scene catalog through the module command services. Every write is
 * tenant-scoped to the demo actor and uses explicit ids so the `chart(id:)` /
 * `trackSet(id:)` / `communityGroup(id:)` / `obsScenes(...)` queries stay stable
 * and aligned with the web sample data.
 *
 * The persistent server calls this ONLY when the store is empty (so a reboot does
 * not duplicate); the in-memory server calls it on every fresh boot.
 */
export const seedDemoData = async (adapters: DemoAdapters): Promise<void> => {
  const { charts, community, obs, play } = adapters;
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

    // Seed an initial durable playback state (when configured) so the live
    // `playbackState(trackSetId:)` query serves a populated transport state —
    // the web playback control opens on this instead of its stopped default.
    if (trackSet.initialPlaybackState !== undefined) {
      await play.commandService.setPlaybackState({
        actor: demoActor,
        input: {
          activeSectionRef: trackSet.initialPlaybackState.activeSectionRef,
          clickEnabled: trackSet.initialPlaybackState.clickEnabled,
          positionBeats: trackSet.initialPlaybackState.positionBeats,
          trackSetId: trackSet.trackSetId,
          transportStatus: trackSet.initialPlaybackState.transportStatus
        },
        requestId: `demo-seed-playback-${trackSet.trackSetId}`
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
