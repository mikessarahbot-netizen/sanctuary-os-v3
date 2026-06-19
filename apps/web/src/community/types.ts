/**
 * Local, typed mirror of the Community+ GraphQL read shapes.
 *
 * These intentionally duplicate the server `CommunityGroup` / `Member` /
 * `GroupMembership` / `EngagementSummary` GraphQL types (see
 * `apps/api/src/graphql/community.ts`) instead of importing server internals: the
 * web app must not depend on the api package's source, and the read surface only
 * needs the queried field set. Optional / nullable fields use `| null` (matching
 * the GraphQL nullability) so they are explicit under `exactOptionalPropertyTypes`.
 *
 * PRIVACY (strictest PII surface): every field below is PII-SAFE. A `Member`
 * exposes a `displayName` (a directory name — safe to show) and its `status`,
 * but NEVER a raw contact value. Contact data is carried only as opaque
 * `ContactChannelRefEntry` rows — a vault `channelRef` + `kind` + `consentStatus`
 * — and there is no phone/email/address scalar on any Community+ type. This
 * surface renders the ref/kind/consent only, never a contact value.
 *
 * Enum-valued fields (`kind`, `roleInGroup`, `status`, `consentStatus`) arrive as
 * the GraphQL SDL enum names; hyphenated domain values are exposed with
 * underscores (`small_group`, `serving_team`, `co_leader`) by the api's enum value
 * maps, so they are typed here as plain `string` (the read surface only displays
 * them, never switches on them).
 */
export interface ContactChannelRefEntry {
  readonly channelRef: string;
  readonly consentStatus: string;
  readonly kind: string;
}

export interface Member {
  readonly contactChannelRefs: readonly ContactChannelRefEntry[];
  readonly displayName: string;
  readonly householdRef: string | null;
  readonly memberId: string;
  readonly status: string;
  readonly tenantId: string;
}

export interface CommunityGroup {
  readonly archived: boolean;
  readonly groupId: string;
  readonly kind: string;
  readonly label: string;
  readonly leaderMemberRef: string | null;
  readonly tenantId: string;
}

export interface GroupMembership {
  readonly active: boolean;
  readonly groupId: string;
  readonly joinedAt: string;
  readonly memberRef: string;
  readonly membershipId: string;
  readonly roleInGroup: string;
  readonly tenantId: string;
}

/**
 * A derived, PII-FREE engagement rollup per member (refs + counts + window
 * timestamps only — by construction it can never carry a name or contact value).
 * The detail view joins these to a group's members by `scope.memberRef` to show
 * an attendance-streak / serving / comms-response summary per member.
 */
export interface EngagementMemberScope {
  readonly memberRef: string;
}

export interface EngagementSummary {
  readonly attendanceStreak: number;
  readonly commsResponseCount: number;
  readonly scope: EngagementMemberScope;
  readonly servingCount: number;
  readonly summaryId: string;
  readonly tenantId: string;
}

/**
 * One row of a group's resolved structure: a membership joined to its member's
 * PII-safe display fields and (when available) that member's engagement summary.
 * `member` is `null` when the membership references a member the read surface
 * could not resolve (kept explicit rather than dropped).
 */
export interface GroupMemberRow {
  readonly membership: GroupMembership;
  readonly member: Member | null;
  readonly engagement: EngagementSummary | null;
}

/**
 * A community group together with its resolved member rows — the full payload the
 * detail view renders. The data source assembles this from the `communityGroup`,
 * `groupMemberships`, `members`, and `engagementSummaries` queries (live) or the
 * sample fixture (demo).
 */
export interface CommunityGroupDetail {
  readonly group: CommunityGroup;
  readonly members: readonly GroupMemberRow[];
}

/**
 * Discriminated state for the Community list view. Components render off this
 * union so loading, error, empty, and populated states are all type-checked.
 */
export type CommunityLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly groups: readonly CommunityGroup[] };

export type CommunityDetailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "missing" }
  | { readonly status: "loaded"; readonly detail: CommunityGroupDetail };
