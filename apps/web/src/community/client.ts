import type {
  AiDraftedMessage,
  CommunicationChannel,
  CommunicationMessageRef,
  CommunityGroup,
  CommunityGroupDetail,
  DraftWithAiInput,
  EngagementSummary,
  GroupMemberRow,
  GroupMembership,
  Member,
  QueuedCommunicationResult,
  ResolvedAudience
} from "./types.js";

/**
 * Minimal typed GraphQL client for the Community+ read surface.
 *
 * POSTs the `communityGroups` / `communityGroup` / `groupMemberships` /
 * `members` / `engagementSummaries` queries to a configurable endpoint (the api's
 * Node http listener serves POST `/graphql`; see
 * `apps/api/src/graphql/http-server.ts`). It does not import server internals —
 * the request/response shapes are declared locally. The endpoint defaults to the
 * same-origin `/graphql`, which the Vite dev server proxies to the demo API (see
 * `apps/web/vite.config.mts`) so live mode is same-origin and needs no CORS. This
 * mirrors `apps/web/src/charts/client.ts` and `apps/web/src/play/client.ts` (same
 * auth header + `executeQuery` plumbing); the surfaces are kept independent on
 * purpose.
 *
 * PRIVACY: the selected `Member` fields are `displayName` (a directory name) +
 * `status` + the opaque `contactChannelRefs` (channelRef / kind / consentStatus).
 * No phone/email/address scalar exists on any Community+ type, so this client can
 * never request — and the surface can never render — a raw contact value.
 *
 * THE COMMS GATE (the second safety gate, alongside OBS): the client also exposes
 * the outbound-communications lifecycle — `composeDraft` (drafts a message for a
 * group + channel), `getResolvedAudience` (the consent-filtered preview: included
 * vs suppressed recipient REFS, never contact values), and the confirm-send path
 * `confirmAndQueue` which runs `markCommunicationReviewed → confirmCommunicationSend
 * (with the human reason) → queueConfirmedCommunication`. The server refuses to
 * queue a message that has not been human-confirmed (lifecycle:
 * `draft → reviewed → confirmed → queued`), so a queue can never fire without a
 * confirm. The send itself is a FAKE port this slice — no real carrier is reached.
 */
export const DEFAULT_API_URL = "/graphql";

/**
 * The actor ref a confirm-send is attributed to. Cosmetic in demo mode (the demo
 * source does not authenticate); it pairs with the `demo-web-operator` bearer
 * token the live client sends and the fixed demo actor the demo server resolves.
 */
export const DEFAULT_COMMS_ACTOR_REF = "demo-web-operator";

/**
 * Demo bearer token for live mode. The local demo API (`apps/api/src/demo`)
 * resolves every request to a fixed demo actor and only requires the
 * `Authorization` header to be present and non-empty — no real secret.
 */
export const DEFAULT_AUTH_TOKEN = "demo-web-operator";

const COMMUNITY_GROUP_FIELDS = `
  archived
  groupId
  kind
  label
  leaderMemberRef
  tenantId
`;

// Member fields are PII-safe ONLY: a display name + status + opaque contact refs
// (channelRef / kind / consent). There is deliberately no contact-value field to
// select — the schema does not expose one.
const MEMBER_FIELDS = `
  contactChannelRefs {
    channelRef
    consentStatus
    kind
  }
  displayName
  householdRef
  memberId
  status
  tenantId
`;

const GROUP_MEMBERSHIP_FIELDS = `
  active
  groupId
  joinedAt
  memberRef
  membershipId
  roleInGroup
  tenantId
`;

const ENGAGEMENT_SUMMARY_FIELDS = `
  attendanceStreak
  commsResponseCount
  scope {
    ... on EngagementMemberScope {
      memberRef
    }
  }
  servingCount
  summaryId
  tenantId
`;

const LIST_COMMUNITY_GROUPS_QUERY = `query ListCommunityGroups { communityGroups { ${COMMUNITY_GROUP_FIELDS} } }`;

const GET_COMMUNITY_GROUP_QUERY = `query GetCommunityGroup($id: ID!) { communityGroup(id: $id) { ${COMMUNITY_GROUP_FIELDS} } }`;

const LIST_GROUP_MEMBERSHIPS_QUERY = `query ListGroupMemberships($groupId: ID!) { groupMemberships(groupId: $groupId) { ${GROUP_MEMBERSHIP_FIELDS} } }`;

const LIST_MEMBERS_QUERY = `query ListMembers { members { ${MEMBER_FIELDS} } }`;

const LIST_ENGAGEMENT_SUMMARIES_QUERY = `query ListEngagementSummaries { engagementSummaries(filter: { scopeKind: member }) { ${ENGAGEMENT_SUMMARY_FIELDS} } }`;

// The drafted-message projection the comms mutations return. Refs + lifecycle
// status only — the surface never re-reads the body/subject from here (the
// operator typed it), and there is no recipient contact value to select.
const COMMUNICATION_MESSAGE_FIELDS = `
  channel
  messageId
  origin
  status
`;

// The consent-filtered audience preview. INCLUDED recipients carry a memberRef +
// the opaque vault channelRef; SUPPRESSED recipients carry a memberRef + a machine
// reason (+ observed consentStatus). There is deliberately NO contact-value field
// to select on either side — the schema exposes none.
const RESOLVED_AUDIENCE_FIELDS = `
  channel
  included {
    channelRef
    memberRef
  }
  suppressed {
    consentStatus
    memberRef
    reason
  }
`;

// The human-confirm gate sends `origin: human` for an operator-composed message
// (an AI draft would be `ai_drafted`; either way the server binds it to the same
// confirm-before-send gate). The SDL enum is hyphen-free, so this literal is sent
// unchanged.
const HUMAN_COMMS_ORIGIN = "human";

const DRAFT_COMMUNICATION_MUTATION = `mutation DraftCommunicationMessage($input: DraftCommunicationMessageInput!) { draftCommunicationMessage(input: $input) { ${COMMUNICATION_MESSAGE_FIELDS} } }`;

// The AI-draft projection adds the drafted TEXT (bodyTemplate + a subject on email)
// to the lifecycle ref so the operator can SEE the AI draft for review. The body is
// placeholder-token text — never a resolved contact value. The returned origin is
// `ai_drafted`; the message is a `draft` bound by the same confirm-before-send gate.
const AI_DRAFTED_MESSAGE_FIELDS = `
  bodyTemplate
  channel
  messageId
  origin
  status
  subject
`;

const DRAFT_WITH_AI_MUTATION = `mutation DraftCommunicationWithAi($input: DraftCommunicationWithAiInput!) { draftCommunicationWithAi(input: $input) { ${AI_DRAFTED_MESSAGE_FIELDS} } }`;

const RESOLVED_AUDIENCE_QUERY = `query ResolvedAudience($messageId: ID!) { resolvedAudience(messageId: $messageId) { ${RESOLVED_AUDIENCE_FIELDS} } }`;

const MARK_REVIEWED_MUTATION = `mutation MarkCommunicationReviewed($input: MarkCommunicationReviewedInput!) { markCommunicationReviewed(input: $input) { ${COMMUNICATION_MESSAGE_FIELDS} } }`;

const CONFIRM_SEND_MUTATION = `mutation ConfirmCommunicationSend($input: ConfirmCommunicationSendInput!) { confirmCommunicationSend(input: $input) { ${COMMUNICATION_MESSAGE_FIELDS} } }`;

const QUEUE_CONFIRMED_MUTATION = `mutation QueueConfirmedCommunication($input: QueueConfirmedCommunicationInput!) { queueConfirmedCommunication(input: $input) { ${COMMUNICATION_MESSAGE_FIELDS} } }`;

interface GraphqlError {
  readonly message: string;
}

interface GraphqlResponse<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly GraphqlError[];
}

interface ListCommunityGroupsData {
  readonly communityGroups: readonly CommunityGroup[];
}

interface GetCommunityGroupData {
  readonly communityGroup: CommunityGroup | null;
}

interface ListGroupMembershipsData {
  readonly groupMemberships: readonly GroupMembership[];
}

interface ListMembersData {
  readonly members: readonly Member[];
}

interface ListEngagementSummariesData {
  readonly engagementSummaries: readonly EngagementSummary[];
}

interface DraftCommunicationData {
  readonly draftCommunicationMessage: CommunicationMessageRef;
}

interface DraftWithAiData {
  readonly draftCommunicationWithAi: AiDraftedMessage;
}

interface ResolvedAudienceData {
  readonly resolvedAudience: ResolvedAudience | null;
}

interface MarkReviewedData {
  readonly markCommunicationReviewed: CommunicationMessageRef;
}

interface ConfirmSendData {
  readonly confirmCommunicationSend: CommunicationMessageRef;
}

interface QueueConfirmedData {
  readonly queueConfirmedCommunication: CommunicationMessageRef;
}

/**
 * Input to compose a draft for a group + channel. `subject` is allowed ONLY on the
 * email channel (the server schema rejects a subject on sms/push); the caller omits
 * it otherwise (conditional spread).
 */
export interface ComposeDraftInput {
  readonly groupId: string;
  readonly channel: CommunicationChannel;
  readonly bodyTemplate: string;
  readonly subject?: string;
}

/**
 * Input to confirm + queue a previously composed draft. The single `reason` is the
 * human confirmation reason recorded in the audit trail; it is reused for the
 * confirm and the queue confirmation intents.
 */
export interface ConfirmAndQueueInput {
  readonly messageId: string;
  readonly reason: string;
  readonly confirmedByRef: string;
}

export interface CommunityClientOptions {
  readonly authToken?: string;
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
}

const resolveEndpoint = (endpoint: string | undefined): string =>
  endpoint ?? DEFAULT_API_URL;

const resolveFetch = (fetchImpl: typeof fetch | undefined): typeof fetch => {
  if (fetchImpl !== undefined) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("No fetch implementation is available in this environment.");
  }

  return globalThis.fetch.bind(globalThis);
};

const executeQuery = async <TData>(
  options: CommunityClientOptions,
  query: string,
  variables: Readonly<Record<string, unknown>>
): Promise<TData> => {
  const doFetch = resolveFetch(options.fetchImpl);
  const response = await doFetch(resolveEndpoint(options.endpoint), {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${options.authToken ?? DEFAULT_AUTH_TOKEN}`,
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(
      `Community request failed with HTTP ${String(response.status)}.`
    );
  }

  const payload = (await response.json()) as GraphqlResponse<TData>;
  const firstError = payload.errors?.[0];

  if (firstError !== undefined) {
    throw new Error(firstError.message);
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error("Community response did not include data.");
  }

  return payload.data;
};

/**
 * Join a group's memberships to PII-safe member display fields and engagement
 * summaries, producing the resolved rows the detail view renders. Pure (no I/O)
 * so the demo data source reuses it. Members are looked up by `memberRef`;
 * engagement summaries by the member-scope `memberRef`. A membership whose member
 * cannot be resolved keeps a `null` member rather than being dropped.
 */
export const assembleGroupMemberRows = (
  memberships: readonly GroupMembership[],
  members: readonly Member[],
  engagementSummaries: readonly EngagementSummary[]
): readonly GroupMemberRow[] => {
  const memberByRef = new Map<string, Member>(
    members.map((member) => [member.memberId, member])
  );
  const engagementByRef = new Map<string, EngagementSummary>(
    engagementSummaries.map((summary) => [summary.scope.memberRef, summary])
  );

  return memberships.map((membership): GroupMemberRow => {
    const member = memberByRef.get(membership.memberRef) ?? null;
    const engagement = engagementByRef.get(membership.memberRef) ?? null;

    return { engagement, member, membership };
  });
};

export interface CommunityDataSource {
  readonly listCommunityGroups: () => Promise<readonly CommunityGroup[]>;
  readonly getCommunityGroupDetail: (
    groupId: string
  ) => Promise<CommunityGroupDetail | null>;
  /**
   * Compose + save a draft message for a group + channel (status `draft`). This is
   * the first comms step and reaches NO recipient; it just creates the message the
   * audience is previewed against and the gate acts on.
   */
  readonly composeDraft: (
    input: ComposeDraftInput
  ) => Promise<CommunicationMessageRef>;
  /**
   * Ask the backend to AI-DRAFT a message for a group + channel. The server calls
   * the real `claude-opus-4-8` adapter (when a key is configured) and creates a
   * `draft` message with `origin: "ai-drafted"`, returning it with the drafted text.
   * The draft already exists on the server; the caller then previews its audience
   * and drives it through the SAME human-confirm-send gate (`getResolvedAudience` →
   * `confirmAndQueue`) as a manual draft. AI may draft, never send. In demo mode this
   * returns a canned draft with no network call.
   */
  readonly draftWithAi: (input: DraftWithAiInput) => Promise<AiDraftedMessage>;
  /**
   * The consent-filtered audience preview for a drafted message: who is included
   * (will be sent to) vs suppressed (will NOT), by reference + reason only — never
   * a contact value. Returns `null` when the message is unknown.
   */
  readonly getResolvedAudience: (
    messageId: string
  ) => Promise<ResolvedAudience | null>;
  /**
   * The human-confirm SEND path: review → confirm (with the operator's reason) →
   * queue. This is the ONLY method that queues, and it always confirms first, so a
   * queue can never fire without a human confirmation. Returns the queued result
   * with the included / suppressed counts. The send is faked (no real carrier).
   */
  readonly confirmAndQueue: (
    input: ConfirmAndQueueInput
  ) => Promise<QueuedCommunicationResult>;
}

export const createCommunityClient = (
  options: CommunityClientOptions = {}
): CommunityDataSource => ({
  listCommunityGroups: async (): Promise<readonly CommunityGroup[]> => {
    const data = await executeQuery<ListCommunityGroupsData>(
      options,
      LIST_COMMUNITY_GROUPS_QUERY,
      {}
    );

    return data.communityGroups;
  },
  getCommunityGroupDetail: async (
    groupId: string
  ): Promise<CommunityGroupDetail | null> => {
    const groupData = await executeQuery<GetCommunityGroupData>(
      options,
      GET_COMMUNITY_GROUP_QUERY,
      { id: groupId }
    );
    const { communityGroup } = groupData;

    if (communityGroup === null) {
      return null;
    }

    // Memberships are scoped to the group; members + engagement summaries are
    // tenant-wide reads joined in-client by memberRef. (Community+ exposes no
    // group-scoped member query, so the surface joins the tenant lists.)
    const membershipsData = await executeQuery<ListGroupMembershipsData>(
      options,
      LIST_GROUP_MEMBERSHIPS_QUERY,
      { groupId }
    );
    const membersData = await executeQuery<ListMembersData>(
      options,
      LIST_MEMBERS_QUERY,
      {}
    );
    const engagementData = await executeQuery<ListEngagementSummariesData>(
      options,
      LIST_ENGAGEMENT_SUMMARIES_QUERY,
      {}
    );

    return {
      group: communityGroup,
      members: assembleGroupMemberRows(
        membershipsData.groupMemberships,
        membersData.members,
        engagementData.engagementSummaries
      )
    };
  },
  composeDraft: async (
    input: ComposeDraftInput
  ): Promise<CommunicationMessageRef> => {
    const data = await executeQuery<DraftCommunicationData>(
      options,
      DRAFT_COMMUNICATION_MUTATION,
      {
        input: {
          audience: { groupId: input.groupId, kind: "group" },
          bodyTemplate: input.bodyTemplate,
          channel: input.channel,
          origin: HUMAN_COMMS_ORIGIN,
          // `subject` only on email; conditional spread keeps it absent (not
          // `undefined`) otherwise, which the server schema requires for sms/push.
          ...(input.subject !== undefined ? { subject: input.subject } : {})
        }
      }
    );

    return data.draftCommunicationMessage;
  },
  draftWithAi: async (input: DraftWithAiInput): Promise<AiDraftedMessage> => {
    // The audience is the selected GROUP; the server builds the PII-free engagement
    // projection from it. Optional list hints are conditionally spread so an absent
    // value stays absent (not `null`), which the server schema requires.
    const data = await executeQuery<DraftWithAiData>(
      options,
      DRAFT_WITH_AI_MUTATION,
      {
        input: {
          audience: { groupId: input.groupId, kind: "group" },
          campaignIntent: input.campaignIntent,
          channel: input.channel,
          churchToneSummary: input.churchToneSummary,
          ...(input.forbiddenTopics !== undefined
            ? { forbiddenTopics: [...input.forbiddenTopics] }
            : {}),
          ...(input.requiredPlaceholders !== undefined
            ? { requiredPlaceholders: [...input.requiredPlaceholders] }
            : {})
        }
      }
    );

    return data.draftCommunicationWithAi;
  },
  getResolvedAudience: async (
    messageId: string
  ): Promise<ResolvedAudience | null> => {
    const data = await executeQuery<ResolvedAudienceData>(
      options,
      RESOLVED_AUDIENCE_QUERY,
      { messageId }
    );

    return data.resolvedAudience;
  },
  confirmAndQueue: async (
    input: ConfirmAndQueueInput
  ): Promise<QueuedCommunicationResult> => {
    // Resolve the audience first so the queued result can report the included /
    // suppressed counts (it is also the consent-filtered set the server sends to).
    const audienceData = await executeQuery<ResolvedAudienceData>(
      options,
      RESOLVED_AUDIENCE_QUERY,
      { messageId: input.messageId }
    );
    const audience = audienceData.resolvedAudience;

    // THE GATE, in order: review → confirm (human reason) → queue. The server
    // refuses to queue an unconfirmed message, and queue runs only after confirm
    // here, so a queue can never fire without a human confirmation.
    await executeQuery<MarkReviewedData>(options, MARK_REVIEWED_MUTATION, {
      input: { messageId: input.messageId }
    });
    await executeQuery<ConfirmSendData>(options, CONFIRM_SEND_MUTATION, {
      input: {
        confirmationIntent: { confirmed: true, reason: input.reason },
        confirmedByRef: input.confirmedByRef,
        messageId: input.messageId
      }
    });
    const queuedData = await executeQuery<QueueConfirmedData>(
      options,
      QUEUE_CONFIRMED_MUTATION,
      {
        input: {
          confirmationIntent: { confirmed: true, reason: input.reason },
          messageId: input.messageId
        }
      }
    );

    return {
      includedCount: audience?.included.length ?? 0,
      message: queuedData.queueConfirmedCommunication,
      suppressedCount: audience?.suppressed.length ?? 0
    };
  }
});
