/**
 * Local, typed mirror of the OBS GraphQL read + action shapes.
 *
 * These intentionally duplicate the server `ObsConnectionProfile` / `ObsScene` /
 * `ObsStreamState` / `ObsRecordingState` / `ObsActionIntent` / `ObsActionLogEntry`
 * GraphQL types (see `apps/api/src/graphql/obs.ts`) instead of importing server
 * internals: the web app must not depend on the api package's source, and the
 * surface only needs the queried field set. Optional / nullable fields use `| null`
 * (matching the GraphQL nullability) so they are explicit under
 * `exactOptionalPropertyTypes`.
 *
 * SAFETY (this is the system's strongest "automation must fail gracefully"
 * surface — it drives live, public-facing output): a connection is identified ONLY
 * by an opaque `connectionRef` (a vault handle) — there is no host / port /
 * password / auth-token / stream-key field on any OBS type, so this surface can
 * never request and can never render a secret. Every output-affecting action is
 * bound by the human-confirm gate: a `requested` intent must be explicitly
 * confirmed (with a reason) before it can be dispatched to OBS.
 *
 * Enum-valued fields arrive as the GraphQL SDL enum names; hyphenated domain
 * values are exposed with underscores (`switch_scene`, `ai_suggested`) by the
 * api's enum value maps, so they are typed here as plain `string` (the surface
 * only displays them, except the action `kind` the client sends, which is the
 * SDL literal `"switch_scene"`).
 */
export interface ObsConnectionProfile {
  readonly connectionProfileId: string;
  readonly connectionRef: string;
  readonly connectionStatus: string;
  readonly label: string;
  readonly obsWebsocketVersion: string | null;
  readonly tenantId: string;
}

export interface ObsScene {
  readonly connectionProfileId: string;
  readonly displayName: string;
  readonly isCurrentProgramScene: boolean;
  readonly obsSceneRef: string;
  readonly orderHint: number;
  readonly sceneId: string;
  readonly tenantId: string;
}

export interface ObsStreamState {
  readonly connectionProfileId: string;
  readonly streamStatus: string;
  readonly tenantId: string;
  readonly updatedAt: string;
}

export interface ObsRecordingState {
  readonly connectionProfileId: string;
  readonly recordingStatus: string;
  readonly tenantId: string;
  readonly updatedAt: string;
}

/**
 * The append-only action audit row. Used to render a short "what just happened"
 * status line under the gated flow. `safeMessage` is the redacted failure detail
 * (present only on a `failed` outcome) — never a secret or raw OBS payload.
 */
export interface ObsActionLogEntry {
  readonly actionIntentRef: string;
  readonly logEntryId: string;
  readonly occurredAt: string;
  readonly outcome: string;
  readonly reason: string;
  readonly safeMessage: string | null;
}

/**
 * The action intent returned by the request / confirm / dispatch mutations. The
 * surface keys the gated flow off `status` (`requested` -> `confirmed` ->
 * `dispatched` -> `succeeded`, or `failed`).
 */
export interface ObsActionIntent {
  readonly actionIntentId: string;
  readonly kind: string;
  readonly origin: string;
  readonly status: string;
  readonly targetSceneRef: string | null;
  readonly safeFailureMessage: string | null;
}

/**
 * The full OBS console payload the screen renders: the connection, its scenes
 * (one of which is the current program scene), coarse stream + recording state,
 * and the recent action log. Assembled by the data source from the
 * `obsConnectionProfiles` / `obsScenes` / `obsStreamState` / `obsRecordingState` /
 * `obsActionLog` queries (live) or the sample fixture (demo). `connection` is
 * `null` when no demo OBS connection is configured.
 */
export interface ObsConsole {
  readonly connection: ObsConnectionProfile | null;
  readonly scenes: readonly ObsScene[];
  readonly streamState: ObsStreamState | null;
  readonly recordingState: ObsRecordingState | null;
  readonly actionLog: readonly ObsActionLogEntry[];
}

/**
 * Discriminated state for the OBS console read view. Components render off this
 * union so loading, error, empty, and populated states are all type-checked.
 */
export type ObsConsoleState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly console: ObsConsole };
