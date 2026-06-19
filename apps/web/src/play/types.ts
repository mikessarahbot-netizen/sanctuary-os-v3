/**
 * Local, typed mirror of the Play GraphQL read shapes.
 *
 * These intentionally duplicate the server `TrackSet` / `PlaySection` / `PlayCue`
 * GraphQL types (see `apps/api/src/graphql/play.ts`) instead of importing server
 * internals: the web app must not depend on the api package's source, and the
 * read surface only needs the queried field set. Optional / nullable fields use
 * `| null` (matching the GraphQL nullability) so they are explicit under
 * `exactOptionalPropertyTypes`.
 */
export interface TrackMemberRef {
  readonly label: string | null;
  readonly muted: boolean;
  readonly role: string;
  readonly trackRef: string;
}

export interface TrackSet {
  readonly arrangementRef: string | null;
  readonly createdAt: string;
  readonly defaultKey: string;
  readonly serviceRef: string | null;
  readonly songRef: string;
  readonly tempoBpm: number;
  readonly tenantId: string;
  readonly title: string | null;
  readonly trackRefs: readonly TrackMemberRef[];
  readonly trackSetId: string;
  readonly updatedAt: string;
}

export interface PlaySection {
  readonly arrangementRef: string;
  readonly clickEnabledDefault: boolean;
  readonly kind: string;
  readonly label: string | null;
  readonly lengthBars: number;
  readonly padLayerRef: string | null;
  readonly sectionId: string;
  readonly tenantId: string;
}

export interface PlayCue {
  readonly action: string;
  readonly createdAt: string;
  readonly cueId: string;
  readonly fireMode: string;
  readonly label: string;
  readonly markerOffsetBeats: number;
  readonly padLayerRef: string | null;
  readonly sectionId: string;
  readonly targetSectionRef: string | null;
  readonly tenantId: string;
  readonly trackSetId: string;
  readonly updatedAt: string;
}

/**
 * The three durable transport states (mirror of the server `TransportStatus`
 * SDL enum: `stopped` / `playing` / `paused`). Kept as a string-literal union so
 * the playback control's buttons and status readout are exhaustively typed.
 */
export type PlaybackTransportStatus = "stopped" | "playing" | "paused";

/**
 * Durable playback transport state for a track set — the queried subset of the
 * server `PlaybackState` GraphQL type (see `apps/api/src/graphql/play.ts`).
 * Nullable refs use `| null` (matching GraphQL nullability) so they stay
 * explicit under `exactOptionalPropertyTypes`. The Play detail renders this and
 * the playback control writes it via `setPlaybackState`.
 */
export interface PlaybackState {
  readonly activePadLayerRef: string | null;
  readonly activeSectionRef: string | null;
  readonly clickEnabled: boolean;
  readonly positionBeats: number;
  readonly tenantId: string;
  readonly trackSetId: string;
  readonly transportStatus: PlaybackTransportStatus;
  readonly updatedAt: string;
}

/**
 * A track set together with the sections of its arrangement and its cues — the
 * full payload the detail view renders. The data source assembles this from the
 * `trackSet`, `playSections`, and `playCues` queries (live) or the sample
 * fixture (demo).
 */
export interface TrackSetDetail {
  readonly trackSet: TrackSet;
  readonly sections: readonly PlaySection[];
  readonly cues: readonly PlayCue[];
}

/**
 * Discriminated state for the Play list view. Components render off this union
 * so loading, error, empty, and populated states are all type-checked.
 */
export type PlayLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly trackSets: readonly TrackSet[] };

export type PlayDetailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "missing" }
  | { readonly status: "loaded"; readonly detail: TrackSetDetail };
