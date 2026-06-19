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

/**
 * Local, typed mirror of the Community+ outbound-communications GraphQL shapes
 * (see `apps/api/src/graphql/community.ts`). This is the SECOND safety gate the web
 * surface exposes (alongside OBS): an operator composes a message to a group, the
 * server resolves the consent-filtered audience (who is included vs suppressed),
 * and a message can only be queued after an explicit HUMAN confirmation. AI may
 * draft, never send.
 *
 * PRIVACY (strictest PII surface): every field below is reference-only. A resolved
 * recipient carries a `memberRef` + an opaque vault `channelRef` — NEVER a phone /
 * email / address value. A suppressed recipient carries a `memberRef` + a machine
 * `reason` (+ optional `consentStatus`) — again no contact value. The contact value
 * behind a `channelRef` is resolved outside Community+, at send time, by the
 * integration adapter. This surface renders display names (joined from the group
 * members) + refs + reasons only.
 *
 * The send is FAKED in demo mode (and behind a fake port live) — composing through
 * the queue never reaches a real carrier.
 */

/**
 * The message channel the operator composes for. The SDL enum is hyphen-free so
 * these literals are sent to the server unchanged. `sms` is the demo default
 * because the seeded Hospitality Team has a granted, a denied, and a no-SMS-channel
 * member — so the audience preview shows BOTH an included and two suppressed rows.
 */
export type CommunicationChannel = "sms" | "email" | "push";

/**
 * A resolved, consent-INCLUDED recipient: a `memberRef` plus the opaque vault
 * `channelRef` the send will target. References only — never a contact value.
 */
export interface ResolvedRecipient {
  readonly channelRef: string;
  readonly memberRef: string;
}

/**
 * A SUPPRESSED candidate recipient — flagged with a machine `reason` (and the
 * observed `consentStatus` when the block is a consent posture), never silently
 * dropped. Carries a `memberRef` only; no `channelRef` and no contact value. The
 * UI joins `memberRef` to the group's member display name and renders a
 * human-readable reason so consent suppression is visible.
 */
export interface SuppressedRecipient {
  readonly consentStatus: string | null;
  readonly memberRef: string;
  readonly reason: string;
}

/**
 * The server's consent-aware audience resolution for a drafted message: who is
 * included (will be sent to) vs suppressed (will NOT), for the message channel.
 */
export interface ResolvedAudience {
  readonly channel: string;
  readonly included: readonly ResolvedRecipient[];
  readonly suppressed: readonly SuppressedRecipient[];
}

/**
 * A composed draft (status `draft`) the resolved audience is previewed against and
 * the confirm-send gate acts on. Carries refs + the lifecycle `status` only — the
 * surface never re-renders the `bodyTemplate` from here (the operator typed it).
 */
export interface CommunicationMessageRef {
  readonly channel: string;
  readonly messageId: string;
  readonly origin: string;
  readonly status: string;
}

/**
 * The terminal result of a confirmed, queued send: the message reached a
 * queued/sent state and the audience split is reported back so the UI can show
 * "Queued to N recipients" + the suppressed count. PII-free — counts + refs only.
 */
export interface QueuedCommunicationResult {
  readonly message: CommunicationMessageRef;
  readonly includedCount: number;
  readonly suppressedCount: number;
}

/**
 * The draft an AI-assist produced (server-side `origin: "ai-drafted"`, `status:
 * "draft"`). It extends the lifecycle ref with the AI's `bodyTemplate` (and a
 * `subject` on email) so the compose panel can SHOW the drafted text for review.
 * The draft already exists on the server; the operator reviews it, then drives it
 * through the SAME consent-preview + human-confirm-send gate as a manual draft — an
 * AI draft can never self-advance past `draft`. PRIVACY: the body is placeholder-
 * token text (`{{firstName}}`), never a resolved contact value.
 */
export interface AiDraftedMessage {
  readonly channel: string;
  readonly messageId: string;
  readonly origin: string;
  readonly status: string;
  readonly bodyTemplate: string;
  readonly subject: string | null;
}

/**
 * Input to request an AI-drafted communication for a group + channel. Carries only
 * PII-free hints — the campaign intent, a church-tone summary, and (optional)
 * placeholder tokens / forbidden topics. No member, no contact value. The audience
 * is the selected group; the server builds the PII-free engagement projection.
 */
export interface DraftWithAiInput {
  readonly groupId: string;
  readonly channel: CommunicationChannel;
  readonly campaignIntent: string;
  readonly churchToneSummary: string;
  readonly forbiddenTopics?: readonly string[];
  readonly requiredPlaceholders?: readonly string[];
}
