import type {
  PlaybackState,
  PlayCue,
  PlaySection,
  TrackSet,
  TrackSetDetail
} from "./types.js";

/**
 * Seeded sample Play track sets for demo mode and tests.
 *
 * Demo mode (the default data source, or `?demo` / `VITE_DATA_SOURCE=demo`)
 * renders these so the Play screen is populated and screenshot-able without a
 * live GraphQL API. The same two track sets (arrangement + sections + cues) are
 * seeded into the demo server (`apps/api/src/demo/server.ts`) so live mode
 * renders the same data. Each track set carries an `arrangementRef`; its
 * sections share that ref, and its cues point at those sections.
 */
const BUILD_MY_LIFE_SECTIONS: readonly PlaySection[] = [
  {
    arrangementRef: "arr-build-my-life",
    clickEnabledDefault: true,
    kind: "intro",
    label: "Intro",
    lengthBars: 4,
    padLayerRef: null,
    sectionId: "section-bml-intro",
    tenantId: "tenant-demo"
  },
  {
    arrangementRef: "arr-build-my-life",
    clickEnabledDefault: true,
    kind: "verse",
    label: "Verse 1",
    lengthBars: 8,
    padLayerRef: null,
    sectionId: "section-bml-verse",
    tenantId: "tenant-demo"
  },
  {
    arrangementRef: "arr-build-my-life",
    clickEnabledDefault: true,
    kind: "chorus",
    label: "Chorus",
    lengthBars: 8,
    padLayerRef: null,
    sectionId: "section-bml-chorus",
    tenantId: "tenant-demo"
  }
];

const BUILD_MY_LIFE_CUES: readonly PlayCue[] = [
  {
    action: "play",
    createdAt: "2026-04-01T10:00:00.000Z",
    cueId: "cue-bml-start",
    fireMode: "manual",
    label: "Start intro pad",
    markerOffsetBeats: 0,
    padLayerRef: null,
    sectionId: "section-bml-intro",
    targetSectionRef: null,
    tenantId: "tenant-demo",
    trackSetId: "track-set-build-my-life",
    updatedAt: "2026-04-01T10:00:00.000Z"
  },
  {
    action: "jump",
    createdAt: "2026-04-01T10:05:00.000Z",
    cueId: "cue-bml-to-chorus",
    fireMode: "manual",
    label: "Jump to chorus",
    markerOffsetBeats: 16,
    padLayerRef: null,
    sectionId: "section-bml-verse",
    targetSectionRef: "section-bml-chorus",
    tenantId: "tenant-demo",
    trackSetId: "track-set-build-my-life",
    updatedAt: "2026-04-01T10:05:00.000Z"
  }
];

const BUILD_MY_LIFE: TrackSet = {
  arrangementRef: "arr-build-my-life",
  createdAt: "2026-04-01T09:00:00.000Z",
  defaultKey: "E",
  serviceRef: null,
  songRef: "song-build-my-life",
  tempoBpm: 68,
  tenantId: "tenant-demo",
  title: "Build My Life",
  trackRefs: [
    { label: "Click", muted: false, role: "click", trackRef: "track-bml-click" },
    { label: "Pad", muted: false, role: "pad", trackRef: "track-bml-pad" }
  ],
  trackSetId: "track-set-build-my-life",
  updatedAt: "2026-04-12T17:30:00.000Z"
};

const GOODNESS_SECTIONS: readonly PlaySection[] = [
  {
    arrangementRef: "arr-goodness-of-god",
    clickEnabledDefault: false,
    kind: "verse",
    label: "Verse",
    lengthBars: 8,
    padLayerRef: null,
    sectionId: "section-gog-verse",
    tenantId: "tenant-demo"
  },
  {
    arrangementRef: "arr-goodness-of-god",
    clickEnabledDefault: true,
    kind: "chorus",
    label: "Chorus",
    lengthBars: 8,
    padLayerRef: null,
    sectionId: "section-gog-chorus",
    tenantId: "tenant-demo"
  },
  {
    arrangementRef: "arr-goodness-of-god",
    clickEnabledDefault: false,
    kind: "bridge",
    label: "Bridge",
    lengthBars: 16,
    padLayerRef: null,
    sectionId: "section-gog-bridge",
    tenantId: "tenant-demo"
  }
];

const GOODNESS_CUES: readonly PlayCue[] = [
  {
    action: "pad-change",
    createdAt: "2026-05-02T11:00:00.000Z",
    cueId: "cue-gog-bridge-pad",
    fireMode: "auto",
    label: "Swell into bridge",
    markerOffsetBeats: 64,
    padLayerRef: "pad-gog-warm",
    sectionId: "section-gog-bridge",
    targetSectionRef: null,
    tenantId: "tenant-demo",
    trackSetId: "track-set-goodness-of-god",
    updatedAt: "2026-05-02T11:00:00.000Z"
  },
  {
    action: "stop",
    createdAt: "2026-05-02T11:08:00.000Z",
    cueId: "cue-gog-end",
    fireMode: "manual",
    label: "Stop after bridge",
    markerOffsetBeats: 128,
    padLayerRef: null,
    sectionId: "section-gog-bridge",
    targetSectionRef: null,
    tenantId: "tenant-demo",
    trackSetId: "track-set-goodness-of-god",
    updatedAt: "2026-05-02T11:08:00.000Z"
  }
];

const GOODNESS_OF_GOD: TrackSet = {
  arrangementRef: "arr-goodness-of-god",
  createdAt: "2026-05-02T09:00:00.000Z",
  defaultKey: "G",
  serviceRef: null,
  songRef: "song-goodness-of-god",
  tempoBpm: 64,
  tenantId: "tenant-demo",
  title: "Goodness of God",
  trackRefs: [
    { label: "Click", muted: false, role: "click", trackRef: "track-gog-click" },
    { label: "Strings", muted: false, role: "stem", trackRef: "track-gog-strings" }
  ],
  trackSetId: "track-set-goodness-of-god",
  updatedAt: "2026-05-20T08:45:00.000Z"
};

export const SAMPLE_TRACK_SETS: readonly TrackSet[] = [
  BUILD_MY_LIFE,
  GOODNESS_OF_GOD
];

/**
 * Seeded initial playback transport states for demo mode and tests. Build My
 * Life starts populated (stopped at the intro with click on) so the playback
 * control renders a concrete state without a prior write; the same state is
 * seeded into the demo server (`apps/api/src/demo/server.ts`) so live mode opens
 * the same way. Goodness of God is intentionally left unseeded so the
 * "no state yet -> default stopped" path is exercised in demo too.
 */
export const SAMPLE_PLAYBACK_STATES: readonly PlaybackState[] = [
  {
    activePadLayerRef: null,
    activeSectionRef: "section-bml-intro",
    clickEnabled: true,
    positionBeats: 0,
    tenantId: "tenant-demo",
    trackSetId: "track-set-build-my-life",
    transportStatus: "stopped",
    updatedAt: "2026-04-12T17:30:00.000Z"
  }
];

const SAMPLE_DETAILS: readonly TrackSetDetail[] = [
  { cues: BUILD_MY_LIFE_CUES, sections: BUILD_MY_LIFE_SECTIONS, trackSet: BUILD_MY_LIFE },
  { cues: GOODNESS_CUES, sections: GOODNESS_SECTIONS, trackSet: GOODNESS_OF_GOD }
];

export const findSampleTrackSetDetail = (
  trackSetId: string
): TrackSetDetail | undefined =>
  SAMPLE_DETAILS.find((detail) => detail.trackSet.trackSetId === trackSetId);
