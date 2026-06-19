import type {
  CommunityGroup,
  CommunityGroupDetail,
  EngagementSummary,
  GroupMemberRow,
  GroupMembership,
  Member
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
 */
export const DEFAULT_API_URL = "/graphql";

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
  }
});
